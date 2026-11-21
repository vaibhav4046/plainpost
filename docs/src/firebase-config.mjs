// Firebase web app config for PlainPost.
// The apiKey here is public by design (it ships in every client app); abuse is prevented by
// Firebase App Check (reCAPTCHA v3) enforced on Firebase AI Logic, plus HTTP-referrer
// restrictions on the key. See README "Security".
export const firebaseConfig = {
  apiKey: 'AIzaSyBkVGyv35UkYZR1YkzfzRK8xPysu0U5iyk',
  authDomain: 'plainpost-33916.firebaseapp.com',
  projectId: 'plainpost-33916',
  storageBucket: 'plainpost-33916.firebasestorage.app',
  messagingSenderId: '56544496917',
  appId: '1:56544496917:web:4cb54599bf41267cb6ed1c'
};

// reCAPTCHA Enterprise (Fraud Defense) site key for Firebase App Check. Empty string = App Check skipped
// (only valid while the console has AI Logic App Check unenforced, e.g. early local dev).
export const appCheckSiteKey = '';
