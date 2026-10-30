async function sendOTP(email) {
    try {
        const response = await fetch('http://localhost:5000/send-otp', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });
        const data = await response.json();
        console.log(data.message);
    } catch (error) {
        console.error('Error:', error);
    }
}
