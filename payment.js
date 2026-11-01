const express = require('express');
const router = express.Router();

// 5 నిమిషాల టైమ్ లిమిట్ తో పేమెంట్ ఇనిషియేట్ చేయడానికి రూట్
router.post('/create-payment', async (req, res) => {
    try {
        const { orderId, amount } = req.body;
        
        // 5 నిమిషాల టైమ్ లిమిట్ ( మిల్లీసెకండ్లలో - 5 * 60 * 1000 )
        const expiryTime = Date.now() + 5 * 60 * 1000;

        // ఇక్కడ డైనమిక్ QR కోడ్ లేదా పేమెంట్ గేట్‌వే రిక్వెస్ట్ కోడ్ రాయాలి
        // ఉదాహరణకు డేటాబేస్ లో ఆర్డర్ మరియు expiryTime సేవ్ చేసుకోవచ్చు

        res.status(200).json({
            success: true,
            message: "పేమెంట్ క్యూఆర్ కోడ్ విజయవంతంగా జనరేట్ చేయబడింది.",
            orderId: orderId,
            amount: amount,
            expiryTime: expiryTime // కస్టమర్ కి చూపించడానికి లేదా ఫ్రంటెండ్ టైమర్ కోసం
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "పేమెంట్ సృష్టిలో లోపం ఏర్పడింది.",
            error: error.message
        });
    }
});

// పేమెంట్ స్టేటస్ చెక్ చేయడానికి రూట్
router.post('/verify-payment', async (req, res) => {
    try {
        const { orderId, paymentStatus } = req.body;

        // ఇక్కడ టైమ్ లిమిట్ దాటిపోయిందా లేదా చెక్ చేయాలి
        // ఒకవేళ 5 నిమిషాలు దాటితే పేమెంట్ ఫెయిల్ లేదా ఎక్స్పైర్డ్ అని చూపించాలి

        if (paymentStatus === 'SUCCESS') {
            res.status(200).json({
                success: true,
                message: "పేమెంట్ విజయవంతమైంది! ఆర్డర్ ప్లేస్ చేయబడింది."
            });
        } else {
            res.status(400).json({
                success: false,
                message: "సమయం ముగిసింది లేదా పేమెంట్ విఫలమైంది."
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "వెరిఫికేషన్ లో లోపం ఏర్పడింది.",
            error: error.message
        });
    }
});

module.exports = router;
