import fetch from 'node-fetch'; // ఒకవేళ లేకపోతే: npm install node-fetch

// OTP పంపడానికి ఈ ఫంక్షన్ వాడండి
async function sendOtpEmail(recipientEmail, otpCode) {
    const url = 'https://api.brevo.com/v3/smtp/email';
    
    // Render లో పెట్టుకున్న API కీ మరియు మీ వెరిఫైడ్ ఈమెయిల్ ఇక్కడ వస్తాయి
    const apiKey = process.env.EMAIL_PASS; // Render లోని EMAIL_PASS వేరియబుల్
    const senderEmail = process.env.EMAIL_USER; // మీ మెయిల్ ID

    const data = {
        sender: { email: senderEmail, name: "J-Mart" },
        to: [{ email: recipientEmail }],
        subject: "Your J-Mart OTP Code",
        textContent: `Your OTP code is: ${otpCode}`
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            console.log("OTP Email sent successfully via HTTP API!");
            return true;
        } else {
            const errorData = await response.json();
            console.error("Failed to send email:", errorData);
            return false;
        }
    } catch (error) {
        console.error("Error sending email:", error);
        return false;
    }
}
