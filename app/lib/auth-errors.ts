export function getAuthErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "";

  switch (code) {
    case "auth/email-already-in-use":
      return "An account already exists with this email. Try signing in.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Choose a stronger password.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "The email or password is incorrect.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your internet connection.";
    case "auth/operation-not-allowed":
      return "Enable Email/Password in Firebase Authentication.";
    case "permission-denied":
    case "firestore/permission-denied":
      return "Threadly couldn't save your profile. Check your Firestore rules.";
    default:
      return "Something went wrong. Please try again.";
  }
}
