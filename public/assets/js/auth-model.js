// Validation for the demo sign-in screens. Returns a map of field name to message.
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const cleanUsername = (value = '') => String(value).replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);

function checkEmail(value) {
  const email = String(value ?? '').trim();
  if (!email) return 'Enter your email address.';
  if (!emailPattern.test(email)) return 'Enter a valid email, like you@yourdomain.com.';
  return '';
}

export function checkSignIn({ email, password } = {}) {
  const errors = {};
  const emailError = checkEmail(email);
  if (emailError) errors.email = emailError;
  if (!password) errors.password = 'Enter your password.';
  else if (String(password).length < 8) errors.password = 'Passwords have at least 8 characters.';
  return errors;
}

export function checkSignUp({ name, username, email, password, confirm, terms } = {}) {
  const errors = {};
  const fullName = String(name ?? '').trim();
  if (fullName.length < 2) errors.name = 'Enter your full name.';
  else if (fullName.length > 60) errors.name = 'Use 60 characters or fewer.';
  const handle = cleanUsername(username);
  if (handle.length < 3) errors.username = 'Use 3 to 20 letters, numbers or underscores.';
  const emailError = checkEmail(email);
  if (emailError) errors.email = emailError;
  if (!password || String(password).length < 8) errors.password = 'Use at least 8 characters.';
  if (!confirm) errors.confirm = 'Confirm your password.';
  else if (confirm !== password) errors.confirm = 'Passwords don’t match.';
  if (!terms) errors.terms = 'Accept the terms to create your account.';
  return errors;
}
