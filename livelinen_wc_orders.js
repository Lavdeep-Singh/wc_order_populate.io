document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const phoneNumberInput = document.getElementById('phoneNumberInput');
    const getTokenButton = document.getElementById('getTokenButton');
    const processButton = document.getElementById('processButton');
    const processingMessage = document.getElementById('processingMessage');

    let file;
    let sessionId;

    getTokenButton.disabled = true;

    fileInput.addEventListener('change', (event) => {
        file = event.target.files[0];
        updateButtonStates();
    });

    phoneNumberInput.addEventListener('input', () => {
        updateButtonStates();
    });

    getTokenButton.addEventListener('click', async () => {
        const phoneNumber = phoneNumberInput.value.trim();

        const loginData = {
            phoneNumber: phoneNumber,
            authVerificationType: 'otp',
            device: {
                id: 'wSrnMjBIn8gSwDDM1HTC6',
                details: {
                    screenSize: '600 X 993',
                    storageAccess: true
                },
                platformVersion: '125',
                platform: 'Chrome',
                type: 'Desktop'
            },
            countryCode: '+91',
            source: 'https://www.livelinen.com',
            hashCode: null,
            merchantParams: null
        };

        try {
            const loginResponse = await axios.post('https://api.breeze.in/session/login', loginData);
            const otpSessionToken = loginResponse.data.otpSessionToken;

            const otp = prompt('Please enter the OTP sent to your phone number:');
            if (!otp) return;

            showProcessingMessage(true);

            const verifyData = {
                otp: otp,
                checkoutId: 'PrTi9PKUUdY9LBhLaoEw8',
                otpSessionToken: otpSessionToken,
                ingestFromExternalSources: true,
                enableNotifications: true,
                userMarketingConsent: true,
                merchantParams: null
            };

            const verifyResponse = await axios.post('https://api.breeze.in/otp/verify', verifyData);
            sessionId = verifyResponse.data.sessionInfo[0].token;

            showProcessingMessage(false);
            enableProcessButton();

            // Disable getTokenButton after the token is received
            getTokenButton.disabled = true;
        } catch (error) {
            showProcessingMessage(false);
            console.error('Error:', error);
            alert('Error occurred while getting the token. Please try again later.');
        }
    });

    processButton.addEventListener('click', async () => {
        const token = sessionId;

        if (!token || !file) {
            alert('Please fill all the fields and select a file.');
            return;
        }

        showProcessingMessage(true);

        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        const orderIds = extractOrderIdsFromXlsx(json);
        await updateDescriptionWithOrderId(json, orderIds, token, sessionId);

        const newSheet = XLSX.utils.json_to_sheet(json);
        workbook.Sheets[sheetName] = newSheet;
        const newWorkbook = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([newWorkbook], { type: 'application/octet-stream' });

        showProcessingMessage(false);

        saveAs(blob, 'updated_livelinen.xlsx');
    });

    function extractOrderIdsFromXlsx(json) {
        const orderIds = [];

        json.forEach(row => {
            const notes = row['notes'];
            if (!notes) {
                console.log(`Row does not have valid 'notes': ${JSON.stringify(row)}`);
                return;
            }

            try {
                const notesJson = JSON.parse(notes);
                let transactionId = '';

                if (Array.isArray(notesJson)) {
                    notesJson.forEach(item => {
                        if (item && item.transaction_id) {
                            transactionId = item.transaction_id;
                        }
                    });
                } else if (notesJson && notesJson.transaction_id) {
                    transactionId = notesJson.transaction_id;
                }

                if (transactionId.includes('livelinen-')) {
                    const orderId = transactionId.split('livelinen-')[1].split('-')[0];
                    orderIds.push(orderId);
                }
            } catch (error) {
                console.log(`Error decoding JSON in notes: ${notes}`);
            }
        });

        return orderIds;
    }

    async function getOrderDetails(orderId, token, sessionId) {
        const url = `https://api.breeze.in/order/${orderId}`;
        const headers = {
            'Authorization': `Bearer ${token}`,
            'x-session-id': sessionId,
        };

        try {
            const response = await axios.get(url, { headers });
            if (response.status === 200) {
                return response.data;
            } else {
                console.log(`Error fetching details for order ID ${orderId}: ${response.status}, Response: ${response.data}`);
                return null;
            }
        } catch (error) {
            console.log(`Error fetching details for order ID ${orderId}: ${error}`);
            return null;
        }
    }

    async function updateDescriptionWithOrderId(json, orderIds, token, sessionId) {
        for (let row of json) {
            const notes = row['notes'];
            if (!notes) {
                console.log(`Row does not have valid 'notes': ${JSON.stringify(row)}`);
                continue;
            }

            try {
                const notesJson = JSON.parse(notes);
                let transactionId = '';

                if (Array.isArray(notesJson)) {
                    notesJson.forEach(item => {
                        if (item && item.transaction_id) {
                            transactionId = item.transaction_id;
                        }
                    });
                } else if (notesJson && notesJson.transaction_id) {
                    transactionId = notesJson.transaction_id;
                }

                if (transactionId.includes('livelinen-')) {
                    const orderId = transactionId.split('livelinen-')[1].split('-')[0];
                    if (orderIds.includes(orderId)) {
                        const orderDetails = await getOrderDetails(orderId, token, sessionId);
                        if (orderDetails && orderDetails.platformOrderId) {
                            const platformOrderId = orderDetails.platformOrderId;
                            const currentDescription = row['description'];
                            row['description'] = `${currentDescription} ${platformOrderId}`.trim();
                        }
                    }
                }
            } catch (error) {
                console.log(`Error decoding JSON in notes: ${notes}`);
            }
        }
    }

    function updateButtonStates() {
        getTokenButton.disabled = !phoneNumberInput.value.trim() || !file;
    }

    function enableProcessButton() {
        processButton.disabled = false;
    }

    function showProcessingMessage(show) {
        processingMessage.style.display = show ? 'block' : 'none';
    }
});
