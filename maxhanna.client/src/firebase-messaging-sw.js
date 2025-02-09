importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAR5AbDVyw2RmW4MCLL2aLVa2NLmf3W-Xc",
  authDomain: "bughosted.firebaseapp.com",
  projectId: "bughosted",
  storageBucket: "bughosted.firebasestorage.app",
  messagingSenderId: "288598058428",
  appId: "1:288598058428:web:a4605e4d8eea73eac137b9",
  measurementId: "G-MPRXZ6WVE9"
});

const messaging = firebase.messaging();

messaging.onMessage(messaging, (payload) => { 
  const body = payload.notification.body;
  const title = payload.notification.title;
  alert(`${title}: ${body}`);
});

messaging.onBackgroundMessage((payload) => { 
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: 'https://www.bughosted.com/favicon.ico',
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
