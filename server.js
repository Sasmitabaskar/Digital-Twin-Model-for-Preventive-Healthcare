require('dotenv').config();
const { Calendar } = require('@fullcalendar/core');
const http = require('http');
const fs = require('fs');
const reviewsFilePath = 'reviews.json';
const randomstring = require('randomstring');
const twilio = require('twilio');
const client = new twilio('AC09cf3ad836319c058fa36b2b68fee0ec', 'eb6197f6746587f128e6b55f0bc818bb');
const socketIo = require('socket.io');
const express = require('express');
const { OpenAI } = require('openai');
const openai = new OpenAI({ key: process.env.OPENAI_API_KEY }); 
const puppeteer = require('puppeteer');// Use API key from environment
const nodemailer = require('nodemailer');
const paymentController = require('./paymentController');
const cors = require('cors');
const firebase = require('firebase/app');
require('firebase/database');
require('firebase/auth');
const bodyParser = require('body-parser');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const { ImageAnnotatorClient } = require('@google-cloud/vision');
const multer = require('multer')



const firebaseConfig = {
  apiKey: "AIzaSyBdW23bbbZ7mFaTtxXL1wP0iYdJ5bc828Y",
  authDomain: "myproject-4cb9f.firebaseapp.com",
  databaseURL: "https://myproject-4cb9f-default-rtdb.firebaseio.com",
  projectId: "myproject-4cb9f",
  storageBucket: "myproject-4cb9f.appspot.com",
  messagingSenderId: "537697202917",
  appId: "1:537697202917:web:9b581686949e8c6ce81a0c"
};
firebase.initializeApp(firebaseConfig);

const corsOptions = {
  origin: '*', 
};
app.use(cors(corsOptions));
const Client = new ImageAnnotatorClient({
  keyFilename: 'public/central-beach-396805-212792c34f50.json', // Update with your JSON key file path
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(express.static('public'));


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.use(express.json());



app.post('/recognize', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }

  const buffer = req.file.buffer;

  try {
    const [result] = await Client.labelDetection(buffer);
    const labels = result.labelAnnotations;
    const descriptions = labels.map((label) => label.description);
    res.json(descriptions);
  } catch (error) {
    console.error('Error recognizing the image:', error);
    res.status(500).json({ error: 'Failed to recognize the image' });
  }
});





app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    const [result] = await vision.labelDetection(req.file.buffer);
    const labels = result.labelAnnotations.map(label => label.description);
    res.json({ labels });
  } catch (error) {
    console.error('Error analyzing the image:', error);
    res.status(500).json({ error: 'Image analysis failed' });
  }
});



if (!fs.existsSync(reviewsFilePath)) {
  fs.writeFileSync(reviewsFilePath, '[]');
}

app.get('/get-reviews', (req, res) => {
  try {
    const reviews = JSON.parse(fs.readFileSync(reviewsFilePath));

    // Sort the reviews by rating (highest to lowest)
    reviews.sort((a, b) => b.rating - a.rating);

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching reviews' });
  }
});

// Add a new review
app.post('/add-review', (req, res) => {
  const newReview = req.body;
  const reviews = JSON.parse(fs.readFileSync(reviewsFilePath));
  reviews.push(newReview);
  fs.writeFileSync(reviewsFilePath, JSON.stringify(reviews, null, 2));

  // Sort the reviews by rating (highest to lowest)
  reviews.sort((a, b) => b.rating - a.rating);
  res.json({ message: 'Review added successfully' });
});


app.get('/send-sms', (req, res) => {
  const { message } = req.query;
const phoneNumber = '+919360836267';
  client.messages
      .create({
          from: '+12296336225',
          body: message,
          to: phoneNumber
      })
      .then(() => {
          res.send('SMS reminder sent successfully.');
      })
      .catch((error) => {
        console.error('Error sending SMS reminder:', error);
          res.status(500).send('Error sending SMS reminder: ' + error.message);
      });
});
app.post('/create-payment-intent', paymentController.createPaymentIntent);
app.post('/confirm-payment', paymentController.confirmPayment);
app.post('/analyze', async (req, res) => {
  try {
    const { symptom } = req.body;
    console.log('Received symptom:', symptom);

    const prompt = `Symptom: ${symptom}\nAI Response:`;
    const response = await openai.chat.completions.create({
      messages: [{ role: 'system', content: 'You are a helpful assistant that provides information about symptoms.' },
                 { role: 'user', content: prompt }],
      model: 'gpt-3.5-turbo-0301',
    });

    const analysis = response.choices[0].message.content;

    res.json({ analysis });
  } catch (error) {
    console.error('Error in /analyze:', error); 
    res.status(500).json({ error: 'An error occurred during analysis.' });
  }
});

//chatbot
app.post('/ask-gpt3', async (req, res) => {
  const userMessage = req.body.userMessage;

  // Send the user's message to the GPT-3 model
  const gpt3Response = await openai.completions.create({
      model: 'text-davinci-002', // Use the appropriate GPT-3 engine
      prompt: userMessage,
      messages: [{ role: 'system', content: 'You are a medical assistant with expertise in general medicine.' },
      { role: 'user', content: prompt }],
      // Set the desired response length
  });

  const botResponse = gpt3Response.choices[0].text;
  res.json({ message: botResponse });
});
let conversation = [];
io.on('connection', (socket) => {
  console.log('A user connected');

  // Send the conversation history to the new user
  socket.emit('conversation', conversation);

  // Listen for messages from the user
  socket.on('message', (message) => {
    // Add the user's message to the conversation
    conversation.push({ user: true, text: message });
    io.emit('conversation', conversation); // Broadcast the conversation to all users

    // Process the user's message (You can implement more sophisticated logic here)
    const response = processUserMessage(message);

    // Add the bot's response to the conversation
    conversation.push({ user: false, text: response });
    io.emit('conversation', conversation); // Broadcast the conversation to all users
  });
  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});
function processUserMessage(message) {
  // Simple example: Echo the user's message
  return `You said: "${message}"`;
}
app.post('/check-verification-code', (req, res) => {
  const { email, code } = req.body;

  // Check if the entered code matches the code sent to the email
  if (code === getStoredVerificationCodeForEmail(email)) {
      res.json({ valid: true });
  } else {
      res.json({ valid: false });
  }
});

// Define the CAPTCHA verification route
app.post('/verifyPhoneNumber', async (req, res) => {
  const recaptchaResponse = req.body.recaptchaResponse;

  // Verify reCAPTCHA
  const verificationResponse = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `secret=${secretKey}&response=${recaptchaResponse}`,
  });

  const verificationData = await verificationResponse.json();

  if (verificationData.success) {
  
    res.status(200).json({ success: true, message: 'CAPTCHA verification successful'});
  } else {
    // CAPTCHA verification failed
    res.status(400).json({ success: false, message: 'CAPTCHA verification failed' });
  }
});
const transporter = nodemailer.createTransport({
  service: 'Gmail', // Use the email service you prefer
  auth: {
    user: 'deepvitalcheck@gmail.com', 
    pass: 'ddcmvhxltqkrbdcx' 
  } 
});

app.post("/send-info", (req, res) => {
  const { Name, Email, Subject, Comment } = req.body;

 

  const mailOptions = {
    from: Email, // Replace with your email address
    to: "deepvitalcheck@gmail.com", // Replace with the recipient's email address
    subject: Subject,
    text: `Name: ${Name}\nEmail: ${Email}\nSubject: ${Subject}\nComment: ${Comment}`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending email:", error);
      res.status(500).json({ message: "Failed to send email" });
    } else {
      console.log("Email sent: " + info.response);
      res.status(200).json({ message: "Email sent successfully" });
    }
  });
});


app.post('/send-verification-email', async (req, res) => {
  const { doctorEmail, doctorName } = req.body;

 
  const projectURL = 'http://localhost:3003/DoctorSignup.html';
  // Compose the email
  const mailOptions = {
    from: 'deepvitalcheck@gmail.com', 
    to: doctorEmail,
    subject: 'Doctor Verification',
    html: `Hello ${doctorName}, Congratulations! Your account has been verified. You can now sign up and start providing your services on DeepVital.

    Click the link below to complete your registration:
    
    <a href="${projectURL}">Click here to register</a>
    
    If you have any questions or need further assistance, please feel free to contact our support team.

    Best regards,
    DeepVital`,
  };

  // Send the email
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error(error);
      res.status(500).json({ message: 'Email could not be sent.' });
    } else {
      console.log(`Email sent: ${info.response}`);
      res.status(200).json({ message: 'Email sent successfully.' });
    }
  });
});


app.post('/send-reject-email', async (req, res) => {
  console.log('Received a request to send rejection email');
  const { doctorEmail, doctorName } = req.body;
  const projectURL = 'http://localhost:3003/DoctorVerification.html';
  // Compose the email
  const mailOptions = {
    from: 'deepvitalcheck@gmail.com', 
    to: doctorEmail,
    subject: 'Rejection Notification from DeepVital',
    html: `Dear ${doctorName}, We regret to inform you that your application has been rejected due to not meeting our expectations. In order to reapply, please submit all the necessary documents and appropriate certifications listed below:
    
    1. Medical License Certificate
    2. Medical Degree Certificate
    3. Board Certificate
    4. Good Standing Certificate
   
    [Note: Attach all the necessary documents and certifications]
    
    If you have any questions or need further assistance, please feel free to contact our support team.
    Click <a href="${projectURL}">Click here to apply</a> to start.
    Sincerely,
    DeepVital.`,
  };

  // Send the email
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error(error);
      res.status(500).json({ message: 'Email could not be sent.' });
    } else {
      console.log(`Email sent: ${info.response}`);
      res.status(200).json({ message: 'Email sent successfully.' });
    }
  });
});

// Define a route to handle prescription submissions
app.post('/submit-prescription', (req, res) => {
  // Extract form data
  const patientName = req.body.patientName;
  const patientEmail = req.body.patientEmail;
  const prescription = req.body.prescription;
  const dosage = req.body.dosage;
  const usage = req.body.usage;
  const duration = req.body.duration;
  const instructions = req.body.instructions;
  const takenfor = req.body.takenfor;

 
const emailContent = `
<h2>Prescription</h2>
<p>Dear ${patientName}I hope this message finds you in good health. After a thorough examination, we have prepared a medical prescription to help manage your condition. Please find the prescription details below:</p>
<h4><b>Patient information<b></h4>
<p><strong>Patient Name:</strong> ${patientName}</p>
<p><strong>Patient Email:</strong> ${patientEmail}</p>
<h4><b>Prescription details<b></h4>
<p><strong>Medicine:</strong> ${prescription}</p>
<p><strong>Dosage:</strong> ${dosage}</p>
<p><strong>Usage(Frequency):</strong> ${usage}</p>
<p><strong>Duration(Number of days):</strong> ${duration}</p>
<p><strong>Taken for(Reason for prescribing):</strong> ${takenfor}</p>
<p><strong>Special instructions(Additional):</strong> ${instructions}</p>
<p>Please follow the prescribed medication as instructed and adhere to the recommended dosage. If you have any questions or experience any unusual side effects, please do not hesitate to contact us immediately.Your health and well-being are our top priorities. We recommend regular check-ups to monitor your progress, and you can reach out to us for any follow-up consultations.Wishing you a speedy recovery.Stay healthy!</p>
<p>Sincerely,</p>
<p>DeepVital</p>
`;
const mailOptions = {
  from: 'deepvitalcheck@gmail.com', // Replace with your email
  to: patientEmail,
  subject: 'Prescription from DeepVital',
  html: emailContent,
};
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
      res.status(500).json({ error: 'An error occurred while sending the prescription.' });
    } else {
      console.log('Email sent:', info.response);
      res.json({ message: 'Prescription sent successfully.' });
    }
  });
});


app.post('/book-appointment', async (req, res) => {
  try {
   
    // Gather data needed for the emails
    const { doctorName, patientName, selectedDate, selectedTime, doctorEmail, patientEmail, problemStatement, doctorType, Gmeetlink, address, yourage, yourbmi} = req.body;
    let locationContent = '';
    if (doctorType === 'Online') {
      locationContent = `Google Meet Link: ${Gmeetlink}`;
    } else if (doctorType === 'Offline') {
      // Construct the Google Maps URL for the static map image
      const googleMapsApiKey = 'AIzaSyBq-uVpdE786ySHbSNwRo7Prr-hHg0O3Yc';
      const mapWidth = 400; 
      const mapHeight = 300; 
      const zoomLevel = 15; 

      const mapImageUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${encodeURIComponent(
        address
      )}&zoom=${zoomLevel}&size=${mapWidth}x${mapHeight}&key=${googleMapsApiKey}`;

      locationContent = `- Location: ${address || 'Address not specified'}\n\n<img src="${mapImageUrl}" alt="Location Map">`;
    }
    const bookingDetailsHTML = `
        <html>
        <head>
            <title>Booking Details</title>
            <style>
            body {
              font-family: Arial, sans-serif;
              background-color: #f2f2f2;
              margin: 0;
              padding: 0;
          }
          .container {
              max-width: 600px;
              margin: 20px auto;
              background-color: #fff;
              padding: 30px;
              border: 1px solid #ccc;
              box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
              position: relative;
          }
          .logo {
            margin:3px;
              position: absolute;
              top: 0;
              right: 0;
              width: 180px;
              height: auto;
          }
          h1 {
              text-align: center;
              color: #333;
              font-size: 24px;
          }
          p {
              font-size: 16px;
              color: #666;
          }
          strong {
              font-weight: bold;
          }
          .map {
              max-width: 100%;
              height: auto;
          }
        </style>
        </head>
        <body>
        <div class="container">
        <img class="logo" src="data:image/jpeg;base64,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" alt="Logo Alt Text">
            <br><br>
            <h1>Patient Details</h1>
            <p><strong>Doctor:</strong> ${doctorName}</p>
            <p><strong>Patient Name:</strong> ${patientName}</p>
            <p><strong>Age:</strong> ${yourage}</p>
            <p><strong>Body Mass Index:</strong> ${yourbmi}</p>
            <p><strong>Problem Statement:</strong> ${problemStatement}</p>
        
            </div>
        </body>
        </html>
        `;
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        // Set the content of the page to the HTML string
        await page.setContent(bookingDetailsHTML);

        // Generate a PDF from the HTML content
        const pdfBuffer = await page.pdf();
    // Send an email to the doctor
    const doctorMailOptions = {
      from: 'deepvitalcheck@gmail.com',
      to: doctorEmail,
      subject: `DeepVital Booking Confirmation with ${doctorName}`,
      attachments: [
        {
            filename: 'booking-details.pdf',
            content: pdfBuffer,
        },
    ],
      text: `
        Dear ${doctorName},
        We are pleased to confirm the appointment that has been booked by a patient with you. The details are as follows:
        - Doctor: ${doctorName}
        - Date: ${selectedDate}
        - Time: ${selectedTime}
        - Patient Name: ${patientName}
        - Problem Statement: ${problemStatement}
         ${locationContent}

        Please make the necessary arrangements for this appointment. If you have any questions or need further information, please feel free to contact us.
        Thank you for choosing our platform for your medical needs.
        Best regards,
        DeepVital
      `
    };
    const patientMailOptions = {
      from: 'deepvitalcheck@gmail.com',
      to: patientEmail,
      subject: `DeepVital Booking Confirmation with ${doctorName}`,
      attachments: [
        {
            filename: 'booking-details.pdf',
            content: pdfBuffer,
        },
    ],
      text: `
        Dear ${patientName},

        Your appointment with ${doctorName} has been confirmed. The details are as follows:

        - Doctor: ${doctorName}
        - Date: ${selectedDate}
        - Time: ${selectedTime}
        ${locationContent}

        Please be on time for your appointment. If you have any questions or need to cancel or reschedule, please contact us.
        Thank you for choosing DeepVital for your medical needs.

        Best regards,
        DeepVital
      `
    };
    // Send the doctor's email
    await transporter.sendMail(doctorMailOptions);

    
    await transporter.sendMail(patientMailOptions);

    res.json({ message: 'Booking is confirmed.Please check your mail for further details.' });
  } catch (error) {
    console.error('Error sending emails: ', error);
    res.status(500).json({ message: 'Booking is unsuccessful.Please try again later' });
  }
});
                                                                          



app.get('/doctorsignin', async (req, res) => {
  const { email, password } = req.query;

  try {
    // Sign in the user with email and password
    const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
    const user = userCredential.user;

    if (user.emailVerified) {
    
      res.redirect('testing.html');
    } else {
      res.status(401).send('Email not verified. Please check your email for verification.');
    }
  } catch (error) {
    // Handle any errors that occur during login
    res.status(401).send('Invalid email or password.');
  }
});

app.get('/Signin', async (req, res) => {
  const { email, password } = req.query;

  try {
    // Sign in the user with email and password
    const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
    const user = userCredential.user;

    if (user.emailVerified) {
    
      res.redirect('Female.html');
    } else {
      res.status(401).send('Email not verified. Please check your email for verification.');
    }
  } catch (error) {
    // Handle any errors that occur during login
    res.status(401).send('Invalid email or password.');
  }
});

app.post('/verifyPhoneNumber', (req, res) => {
  const phoneNumber = req.body.phoneNumber;
  const appVerifier = new firebase.auth.RecaptchaVerifier('create-account-button', {
    'size': 'invisible'
  });
  firebase.auth().signInWithPhoneNumber(phoneNumber, appVerifier)
    .then(confirmationResult => {
      // Store confirmationResult in session or a cache
      res.status(200).json({ message: 'Verification code sent successfully' });
    })
    .catch(error => {
      console.error('Error:', error);
      res.status(500).json({ error: 'Failed to send verification code' });
    });
});
app.post('/createAccountWithPhoneNumber', (req, res) => {
  const confirmationResult = req.body.confirmationResult;
  const verificationCode = req.body.verificationCode;

  // Confirm the verification code
  confirmationResult.confirm(verificationCode)
    .then(userCredential => {
      const user = userCredential.user;
      console.log('User signed in with phone number:', user.phoneNumber);
      res.status(200).json({ message: 'Account created successfully' });
    })
    .catch(error => {
      console.error('Error:', error);
      res.status(500).json({ error: 'Failed to create account' });
    });
});

app.post('/forgot-password', (req, res) => {
  const { email } = req.body;

  firebase
    .auth()
    .sendPasswordResetEmail(email)
    .then(() => {
      res.status(200).send('Password reset email sent.');
    })
    .catch((error) => {
      res.status(400).send('Error sending password reset email.');
    });
});
//REGISTER
app.post("/register", async (req, res) => {
  console.log("POST request to /register received");
  const { name, email, password } = req.body;

  try {
    const userCredential = await firebase
      .auth()
      .createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;

    // Update the user's display name
    await user.updateProfile({ displayName: name });
    
    await user.sendEmailVerification();

    res.redirect("/Signin.html");
  } catch (error) {
    // Handle any errors that occur during registration
    res.status(500).send('Error registering user: ' + error.message);
  }
});

//DOCTOR REGISTER
app.post("/doctorreg", async (req, res) => {
  console.log("POST request to /doctorreg received");
  const { name, email, password } = req.body;

  try {
    const userCredential = await firebase
      .auth()
      .createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;

    // Update the user's display name
    await user.updateProfile({ displayName: name });
    await user.sendEmailVerification();
    
    res.redirect("/doctorsignin.html");
  } catch (error) {
    // Handle any errors that occur during registration
    res.status(500).send('Error registering user: ' + error.message);
  }
});
app.post('/submithead', (req, res) => {
  const MaleHead = {
    'Head Symptom(s)': req.body['Head Symptom(s)'],
    'Neurological Symptom(s)': req.body['Neurological Symptom(s)'],
    'Temperature':req.body['Temperature'],
    'Injury': req.body['Injury'],
    'Pain in Teeth':req.body['Pain in Teeth'],
    'Memory difficulties':req.body['Memory difficulties'],
    'Symptoms preceded by headache':req.body['Symptoms'],
    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ MaleHead }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});

//NECK
app.post('/submitneck', (req, res) => {  
  const MaleNeck = {
    'Neck Symptom(s)': req.body['Neck Symptom(s)'],
    'Cannot swallow food': req.body["Cannot swallow food"],
    'O2 Saturation level':req.body['O2 Saturation level'],
    'COVID19 vaccination status': req.body['COVID19 vaccination status'],
    'Shortness of breath':req.body['Shortness of breath'],
    'Surgery Cosmetic Procedure':req.body['Surgery or Cosmetic procedure'],
    
    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ MaleNeck }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});

//CHEST
app.post('/submitchest', (req, res) => {
  
  const MaleChest = {
    'Chest Symptom(s)': req.body['Chest Symptom(s)'],
    'O2 Saturation level':req.body['O2 Saturation level'],
    'COVID19 vaccination status': req.body['COVID19 vaccination status'],
    'Shortness of breath':req.body['Shortness of breath'],
    'Surgery Cosmetic Procedure':req.body['Surgery Cosmetic procedure'],
    
    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ MaleChest }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});

//ABDOMEN  
app.post('/submitabdomen', (req, res) => {
  
  const MaleAbdomen = {
    'Abdominal Symptom(s)': req.body['Abdominal Symptom(s)'],
    'Location':req.body['Location'],
    'Vomitting': req.body['Vomitting'],
    'Injury':req.body['Injury'],
    'Surgery':req.body['Surgery'],
    'Pain':req.body['Pain'],
    'Medications': req.body['Medications'],
    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ MaleAbdomen }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});

//PELVIS
app.post('/submitpelvis', (req, res) => {
  const MalePelvis = {
    'Pelvic Symptom(s)': req.body['Pelvic Symptom(s)'],
    'Pain':req.body['Pain'],
    'History of Pelvic disease': req.body['History of Pelvic disease'],
    'Injury':req.body['Injury'],
    'Symptoms':req.body['Symptoms'],
    'Surgery':req.body['Surgery'],
    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ MalePelvis }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});

//LEFTARM
app.post('/submitleftarm', (req, res) => {
  
  const MaleLeftArm = {
    'Leftarm Symptom(s)': req.body['Leftarm Symptom(s)'],
    'Swollen areas':req.body['Swollen areas'],
    'Injured parts': req.body['Injured parts'],
    'Deformation':req.body['Deformation'],
    'Pale':req.body['Pale'],
    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ MaleLeftArm }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});

//RIGHTARM
app.post('/submitrightarm', (req, res) => {
  
  const MaleRightArm = {
    'RightArm Symptom(s)': req.body['RightArm Symptom(s)'],
    'Swollen areas':req.body['Swollen areas'],
    'Injured parts': req.body['Injured parts'],
    'Deformation':req.body['Deformation'],
    'Pale':req.body['Pale'],
    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ MaleRightArm }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});


//RIGHTLEG
app.post('/submitrightleg', (req, res) => {
  
  const MaleRightLeg = {
    'RightLeg Symptom(s)': req.body['RightArm Symptom(s)'],
    'Psoriasis':req.body['Psoriasis'],
    'Injured parts': req.body['Injured parts'],
    'Deformation':req.body['Deformation'],
    'Pale':req.body['Pale'],
    'Injury':req.body['Injury']
    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ MaleRightLeg }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});


//LEFTLEG
app.post('/submitleftleg', (req, res) => {
  
  const MaleLeftLeg = {
    'LeftLeg Symptom(s)': req.body['LeftLeg Symptom(s)'],
    'Psoriasis':req.body['Psoriasis'],
    'Injured parts': req.body['Injured parts'],
    'Deformation':req.body['Deformation'],
    'Pale':req.body['Pale'],
    'Injury':req.body['Injury']
    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ MaleLeftLeg }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});

//Femalehead
app.post('/submitfemalehead', (req, res) => {
  
  const FemaleHead = {
    'Head Symptom(s)': req.body['Head Symptom(s)'],
    'Neurological Symptom(s)': req.body['Neurological Symptom(s)'],
    'Temperature':req.body['Temperature'],
    'Injury': req.body['Injury'],
    'Contact':req.body['Contact'],
    'Postnasal drip':req.body['Postnasal drip'],
    'Vomitting':req.body['Vomitting'],
    'Dizziness':req.body['Dizziness'],
    'Lumps,Red or white patches':req.body['Lumps,Red or white patches'],
    'Facial pain or pressure':req.body['Facial pain or pressure'],
    'Blurriness or double vision':req.body['Blurriness or double vision'],
    'Breathing or chest pain':req.body['Breathing or chest pain'],
    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ FemaleHead }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});

//Femaleneck
app.post('/submitfemaleneck', (req, res) => {
  
  const FemaleNeck = {
    'Neck Symptom(s)': req.body['Neck Symptom(s)'],
    'Smoker or alcohol consumer':req.body['Smoker or alcohol consumer'],
    'Cannot swallow food': req.body["Cannot swallow food"],
    'Difficulty in breathing':req.body['Difficulty in breathing'],
    'O2 Saturation level':req.body['O2 Saturation level'],
    'Weight loss':req.body['Weight loss'],
    'Fall or trauma':req.body['Fall or trauma'],
    'Tingling or weakness':req.body['Tingling or weakness'],
    'COVID19 vaccination status': req.body['COVID19 vaccination status'],
    'Surgery Cosmetic Procedure':req.body['Surgery or Cosmetic procedure'],
    
    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ FemaleNeck }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});
//Femalechest
app.post('/submitfemalechest', (req, res) => {
  
  const Femalechest = {
    'Chest Symptom(s)': req.body['Chest Symptom(s)'],
    'O2 Saturation level':req.body['O2 Saturation level'],
    'COVID19 vaccination status': req.body['COVID19 vaccination status'],
    'Shortness of breath':req.body['Shortness of breath'],
    'Heart Tumour':req.body['Heart Tumour'],
    'Asthma or bronchitis':req.body['Asthma or bronchitis'],
    'Pain in ribcage area':req.body['Pain in ribcage area'],
    'Heartburn or Regurgitation':req.body['Heartburn or Regurgitation'],
    'Surgery Cosmetic Procedure':req.body['Surgery Cosmetic procedure'],
    'History of cardio checkups':req.body['History of cardio checkups'],
  };
 
  const userDataRef = db.ref('users'); 
  const newUserDataRef = userDataRef.push(); 
  newUserDataRef.set({ Femalechest }); 
  res.redirect('/Display.html');
});


//Femalebreast
app.post('/submitfemalebreast', (req, res) => {
  
  const Femalebreast = {
    'Breast Symptom(s)': req.body['Breast Symptom(s)'],
    'Swelling or change in size':req.body['Swelling or change in size'],
    'Fever or flu': req.body['Fever or flu'],
    'Change in nipples':req.body['Change in nipples'],
    'Trauma or injury':req.body['Trauma or injury'],
    'Lumps or discharge':req.body['Lumps or discharge'],
    'Redness or warmth':req.body['Redness or warmth'],
    'Tightness or heaviness':req.body['Tightness or heaviness'],
    'Surgery Cosmetic procedure':req.body['Surgery Cosmetic procedure'],
    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ Femalebreast }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});

//Femaleabdomen
app.post('/submitfemaleabdomen', (req, res) => {
  
  const Femaleabdomen = {
    'Abdominal Symptom(s)': req.body['Abdominal Symptom(s)'],
    'Location':req.body['Location'],
    'Vomitting': req.body['Vomitting'],
    'Injury':req.body['Injury'],
    'Surgery':req.body['Surgery'],
    'Pain':req.body['Pain'],
    'Medications': req.body['Medications'],
    'Heavy bleeding':req.body['Heavy bleeding'],
    'Feeling of fullness or loss of appetite':req.body['Feeling of fullness or loss of appetite'],
    'Persistent weakness':req.body['Persistent weakness'],
    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ Femaleabdomen }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});

//Femalepelvis
app.post('/submitfemalepelvis', (req, res) => {
  
  const Femalepelvis = {
    'Pelvic Symptom(s)': req.body['Pelvic Symptom(s)'],
    'Pain':req.body['Pain'],
    'History of Pelvic disease': req.body['History of Pelvic disease'],
    'Injury':req.body['Injury'],
    'Symptoms':req.body['Symptoms'],
    'Surgery':req.body['Surgery'],
    'Cause of pain':req.body['Cause of pain'],
    'Heavy menstrual bleeding': req.body['Heavy menstrual bleeding'],
    'Unusual vaginal discharge or odour':req.body['Unusual vaginal discharge or odour'],
    'Abnormal weight changes':req.body['Abnormal weight changes'],
    'Irregular bleeding or spotting between periods':req.body['Irregular bleeding or spotting between periods'],
    'Pain or burning sensation':req.body['Pain or burning sensation'],

  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ Femalepelvis }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});


//Femaleshoulder
app.post('/submitfemaleshoulder', (req, res) => {
  
  const Femaleshoulder = {
    'Shoulder Symptom(s)': req.body['Shoulder Symptom(s)'],
    'Swelling or Deformation':req.body['Swelling or Deformation'],
    'Injury':req.body['Injury'],
    'Pain':req.body['Pain'],
    'Pain increased during activities': req.body['Pain increased during activities'],
    'Difficulty in lifting or rotating arm':req.body['Difficulty in lifting or rotating arm'],
    'Worsen with weather changes':req.body['Worsen with weather changes'],
    'Medications or supplements':req.body['Medications or supplements'],
    'Injury or surgery':req.body['Injury or surgery'],

    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ Femaleshoulder }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});


//Femalehumerus
app.post('/submitfemalehumerus', (req, res) => {
  
  const Femalehumerus = {
    'Humerus Symptom(s)': req.body['Humerus Symptom(s)'],
    'Swelling or Deformation':req.body['Swelling or Deformation'],
    'Injury':req.body['Injury'],
    'Pain':req.body['Pain'],
    'Pain increased during activities': req.body['Pain increased during activities'],
    'Neurological symptoms':req.body['Neurological symptoms'],
    'Worsen with weather changes':req.body['Worsen with weather changes'],
    'Medications or supplements':req.body['Medications or supplements'],
    'Affects daily activities':req.body['Affects daily activities'],
    'Injury or surgery':req.body['Injury or surgery'],

    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ Femalehumerus }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});


//FemalElbowjoint
app.post('/submitfemaleelbow', (req, res) => {
  
  const FemaleElbow = {
    'Elbow Symptom(s)': req.body['Elbow Symptom(s)'],
    'Swelling or Deformation':req.body['Swelling or Deformation'],
    'Injury':req.body['Injury'],
    'Pain':req.body['Pain'],
    'Difficulty in lifting or rotating arm': req.body['Difficulty in lifting or rotating arm'],
    'Pain increased during activities':req.body['Pain increased during activities'],
    'Worsen with weather changes':req.body['Worsen with weather changes'],
    'Medications or supplements':req.body['Medications or supplements'],
    'Allergy':req.body['Allergy'],
    'Injury or surgery':req.body['Injury or surgery'],

    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ FemaleElbow }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});

//Femaleforearm
app.post('/submitfemaleforearm', (req, res) => {
  
  const Femaleforearm = {
    'ForeArm Symptom(s)': req.body['ForeArm Symptom(s)'],
    'Swelling or Deformation':req.body['Swelling or Deformation'],
    'Injury':req.body['Injury'],
    'Pain':req.body['Pain'],
    'Pain increased during activities': req.body['Pain increased during activities'],
    'Neurological symptoms':req.body['Neurological symptoms'],
    'Worsen with weather changes':req.body['Worsen with weather changes'],
    'Medications or supplements':req.body['Medications or supplements'],
    'Affects daily activities':req.body['Affects daily activities'],
    'Injury or surgery':req.body['Injury or surgery'],

    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ Femaleforearm }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});


//Femalewrist
app.post('/submitfemalewrist', (req, res) => {
  
  const Femalewrist = {
    'Wrist Symptom(s)': req.body['Wrist Symptom(s)'],
    'Swelling or Deformation':req.body['Swelling or Deformation'],
    'Injury':req.body['Injury'],
    'Pain':req.body['Pain'],
    'Pain increased during activities': req.body['Pain increased during activities'],
    'Neurological symptoms':req.body['Neurological symptoms'],
    'Medications or supplements':req.body['Medications or supplements'],
    'Affects daily activities':req.body['Affects daily activities'],
    'Injury or surgery':req.body['Injury or surgery'],

    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ Femalewrist}); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});


//Femalehand
app.post('/submitfemalehand', (req, res) => {
  
  const Femalehand = {
    'Hand Symptom(s)': req.body['Hand Symptom(s)'],
    'Swelling or Deformation':req.body['Swelling or Deformation'],
    'Injury':req.body['Injury'],
    'Pain':req.body['Pain'],
    'Pain increased during activities': req.body['Pain increased during activities'],
    'Neurological symptoms':req.body['Neurological symptoms'],
    'Worsen with weather changes':req.body['Worsen with weather changes'],
    'Medications or supplements':req.body['Medications or supplements'],
    'Affects daily activities':req.body['Affects daily activities'],
    'Injury or surgery':req.body['Injury or surgery'],

    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ Femalehand }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});


//Femalethigh
app.post('/submitfemalethigh', (req, res) => {
  
  const Femalethigh = {
    'Thigh Symptom(s)': req.body['Thigh Symptom(s)'],
    'Swelling or Deformation':req.body['Swelling or Deformation'],
    'Injury':req.body['Injury'],
    'Pain':req.body['Pain'],
    'Smoker or alcoholist': req.body['Smoker or alcoholist'],
    'Neurological symptoms':req.body['Neurological symptoms'],
    'Autoimmune diseases':req.body['Autoimmune diseases'],
    'Medications or supplements':req.body['Medications or supplements'],
    'Affects daily activities':req.body['Affects daily activities'],
    'Injury or surgery':req.body['Injury or surgery'],

    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ Femalethigh }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});


//Femaleknee
app.post('/submitfemaleknee', (req, res) => {
  
  const Femaleknee = {
    'Knee Symptom(s)': req.body['Knee Symptom(s)'],
    'Swelling or Deformation':req.body['Swelling or Deformation'],
    'Autoimmune disorders':req.body['Autoimmune disorders'],
    'Pain':req.body['Pain'],
    'Smoking or alcohol consumption': req.body['Smoking or alcohol consumption'],
    'Frustation,anxiety or depression':req.body['Frustation,anxiety or depression'],
    'Hereditary disorders':req.body['Hereditary disorders'],
    'Medications or supplements':req.body['Medications or supplements'],
    'Difficulty in bearing weight':req.body['Difficulty in bearing weight'],
    'Trauma or Injury':req.body['Trauma or Injury'],

    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ Femaleknee }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});

//Femaleshin
app.post('/submitfemaleshin', (req, res) => {
  
  const Femaleshin = {
    'Shin Symptom(s)': req.body['Shin Symptom(s)'],
    'Swelling or Deformation':req.body['Swelling or Deformation'],
    'Autoimmune diseases':req.body['Autoimmune diseases'],
    'Pain':req.body['Pain'],
    'Injury':req.body['Injury'],
    'Smoker or alcoholist': req.body['Smoker or alcoholist'],
    'Neurological symptoms':req.body['Neurological symptoms'],
    'Medications or supplements':req.body['Medications or supplements'],
    'Affects daily activities':req.body['Affects daily activities'],
    'Injury or surgery':req.body['Injury or surgery'],

    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ Femaleshin }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});


//Femaleankle
app.post('/submitfemaleankle', (req, res) => {
  
  const Femaleankle = {
    'Ankle Symptom(s)': req.body['Ankle Symptom(s)'],
    'Swelling or Deformation':req.body['Swelling or Deformation'],
    'Autoimmune diseases':req.body['Autoimmune diseases'],
    'Prolonged standing or walking':req.body['Prolonged standing or walking'],
    'Injury':req.body['Injury'],
    'Smoker or alcoholist': req.body['Smoker or alcoholist'],
    'Neurological symptoms':req.body['Neurological symptoms'],
    'Pain relievers or anti-inflammatory drugs':req.body['Pain relievers or anti-inflammatory drugs'],
    'Footwear with inadequate support':req.body['Footwear with inadequate support'],
    'Injury or surgery':req.body['Injury or surgery'],

    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ Femaleankle }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});


//Femalefoot
app.post('/submitfemalefoot', (req, res) => {
  
  const Femalefoot = {
    'Foot Symptom(s)': req.body['Foot Symptom(s)'],
    'Swelling or Deformation':req.body['Swelling or Deformation'],
    'Diabetes or arthritis':req.body['Diabetes or arthritis'],
    'Prolonged standing or walking':req.body['Prolonged standing or walking'],
    'Injury':req.body['Injury'],
    'Autoimmune diseases':req.body['Autoimmune diseases'],
    'Smoker or alcoholist': req.body['Smoker or alcoholist'],
    'Neurological symptoms':req.body['Neurological symptoms'],
    'Pain relievers or anti-inflammatory drugs':req.body['Pain relievers or anti-inflammatory drugs'],
    'Footwear with inadequate support':req.body['Footwear with inadequate support'],
    'Injury or surgery':req.body['Injury or surgery'],

    // Add more options as needed
  };
  // Save the data and selected options to the Firebase database
  const userDataRef = db.ref('users'); // Reference to the "users" node
  const newUserDataRef = userDataRef.push(); // Create a new child node under "users"
  newUserDataRef.set({ Femalefoot }); // Set the selected options as the data for the new child node
  res.redirect('/Display.html');
});

//USER DETAILS PAGE 
app.get('/UserDetails', (req, res) => {
  const { name, email, date } = req.query;
  const newRef = db.ref('users').push();
  newRef.set({ name, email, date });

  res.redirect('/Gender.html');
});

//Start the server
const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});



