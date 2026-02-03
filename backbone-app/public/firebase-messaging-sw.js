/* eslint-env serviceworker */
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBKLqcnFQwNSKqHXgTBLok3l74ZmNh6_y0",
  authDomain: "backboneai.firebaseapp.com",
  projectId: "backboneai",
  storageBucket: "backboneai.firebasestorage.app",
  messagingSenderId: "338899630498",
  appId: "1:338899630498:web:ae0b9f35c498c88c8e498c"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body, icon, image } = payload.notification || {};
  const data = payload.data || {};

  self.registration.showNotification(title || "BACKBONE", {
    body: body || "You have a new notification",
    icon: icon || "/icons/icon-192.png",
    image: image || undefined,
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/" },
    actions: data.url ? [{ action: "open", title: "Open" }] : []
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "https://backboneai.web.app";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if open
      for (const client of windowClients) {
        if (client.url === url && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      return clients.openWindow(url);
    })
  );
});
