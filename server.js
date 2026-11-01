// OTP సేవ్ చేసుకోవడానికి తాత్కాలికంగా ఒక ఆబ్జెక్ట్ (లేదా డేటాబేస్ వాడుకోవచ్చు)
let storedOtp = {};

// 1. OTP సెండ్ చేసే కోడ్ (ఇప్పటికే ఉన్నది)
app.post('/send-otp', async (req, res) => {
    try {
        const { email } = req.body;
        const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 డిజిట్ రాండమ్ OTP
        
        storedOtp[email] = otp; // ఆ ఈమెయిల్ కి సంబంధించిన OTP స్టోర్ చేస్తున్నాం

        let apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
        let sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

        sendSmtpEmail.subject = "Your J-Mart OTP Code";
        sendSmtpEmail.htmlContent = `<html><body><h1>Your OTP is ${otp}</h1></body></html>`;
        sendSmtpEmail.sender = { "name": "J-Mart", "email": "your-verified-email@domain.com" };
        sendSmtpEmail.to = [{ "email": email }];

        await apiInstance.sendTransacEmail(sendSmtpEmail);
        res.status(200).json({ success: true, message: "OTP sent successfully" });
    } catch (error) {
        console.error("Error sending email:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. OTP వెరిఫై చేసే కొత్త రూట్
app.post('/verify-otp', (req, res) => {
    const { email, otp } = req.body;

    if (storedOtp[email] && storedOtp[email] === otp) {
        delete storedOtp[email]; // సక్సెస్ అయిన తర్వాత OTP డిలీట్ చేయవచ్చు
        res.status(200).json({ success: true, message: "OTP verified successfully!" });
    } else {
        res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }
});
