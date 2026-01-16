// Purpose: Centralized email subjects and text bodies.
export function buildStudentRegistrationMessage(token: string) {
  return {
    subject: 'Verify your email',
    text: `Welcome! Verify your email with this token: ${token}`
  }
}

export function buildEmailVerificationMessage(token: string) {
  return {
    subject: 'Verify your email',
    text: `Verify your email with this token: ${token}`
  }
}

export function buildPasswordResetMessage(token: string) {
  return {
    subject: 'Reset your password',
    text: `Use this token to reset your password: ${token}`
  }
}

export function buildTutorCreatedMessage(token: string) {
  return {
    subject: 'Your tutor account is ready',
    text: `An admin created your tutor account. Verify your email with this token: ${token}`
  }
}

export function buildProfileUpdatedMessage() {
  return {
    subject: 'Your profile was updated',
    text: 'Your profile details were updated.'
  }
}

export function buildActivationChangedMessage(isActive: boolean) {
  return {
    subject: isActive ? 'Your account is now active' : 'Your account has been deactivated',
    text: isActive
      ? 'Your account has been activated. You can now access lessons.'
      : 'Your account has been deactivated. Please contact support if this is unexpected.'
  }
}
