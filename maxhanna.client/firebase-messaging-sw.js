import { getMessaging } from "firebase/messaging/sw";
import { onBackgroundMessage, onMessage } from "firebase/messaging/sw";

const messaging = getMessaging();
 
onMessage(messaging, (payload) => {
  alert('Message received. ', payload); 
});


onBackgroundMessage(messaging, (payload) => {
  alert('[firebase-messaging-sw.js] Received background message ', payload);

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/favicon.ico',
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
