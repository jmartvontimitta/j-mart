const express = require('express');
const path = require('path');
const admin = require('firebase-admin');

// 1. Firebase Service Account Key file ni import cheyadam
const serviceAccount = require('./serviceAccountKey.json');

// 2. Firebase App ni initialize cheyadam
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // Realtime Database vadithe kinda line uncomment chesi URL ivvandi:
  // databaseURL: "https://<YOUR-PROJECT-ID>.firebaseio.com"
});

// 3. Firestore Database instance (Firestore vadutunte)
const db = admin.firestore();

const app = express();
const port = process.env.PORT || 3000;

// JSON request body parse cheyadaniki middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Example API: Firebase Firestore nunchi data tecchukovadaniki
app.get('/api/users', async (req, res) => {
  try {
    const snapshot = await db.collection('users').get();
    const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log('Server is running on port ' + port);
});
