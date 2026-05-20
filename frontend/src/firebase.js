import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'
import { getAnalytics } from 'firebase/analytics'

const firebaseConfig = {
  apiKey:            "AIzaSyAj1y72XzGVmp5DcjPTQMr0FErRVKefkEQ",
  authDomain:        "casegym-3ad98.firebaseapp.com",
  projectId:         "casegym-3ad98",
  storageBucket:     "casegym-3ad98.firebasestorage.app",
  messagingSenderId: "955237625565",
  appId:             "1:955237625565:web:5b39cb4d7125f0f0103534",
  measurementId:     "G-Z1T2K0DXS4"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const analytics = getAnalytics(app)
const googleProvider = new GoogleAuthProvider()

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider)
  return result.user
}

export async function logout() {
  await signOut(auth)
}

export async function getIdToken() {
  const user = auth.currentUser
  if (!user) throw new Error("Not signed in")
  return user.getIdToken()
}