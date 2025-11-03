export function validatePassword(password) {
  if (!password) {
    return { valid: false, message: "Password is required." };
  }

  const minLength = 8;
  const uppercase = /[A-Z]/;
  const lowercase = /[a-z]/;
  const number = /[0-9]/;
  const specialChar = /[!@#$%^&*(),.?":{}|<>]/;

  if (password.length < minLength) {
    return { valid: false, message: `Password must be at least ${minLength} characters long.` };
  }

  if (!uppercase.test(password)) {
    return { valid: false, message: "Password must contain at least one uppercase letter." };
  }

  if (!lowercase.test(password)) {
    return { valid: false, message: "Password must contain at least one lowercase letter." };
  }

  if (!number.test(password)) {
    return { valid: false, message: "Password must contain at least one number." };
  }

  if (!specialChar.test(password)) {
    return { valid: false, message: "Password must contain at least one special character." };
  }

  return { valid: true, message: "Password is strong." };
}