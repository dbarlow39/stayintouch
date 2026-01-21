export type EmailClient = 'gmail' | 'outlook' | 'yahoo' | 'default';

export const EMAIL_CLIENT_OPTIONS = [
  { value: 'gmail', label: 'Gmail' },
  { value: 'outlook', label: 'Outlook' },
  { value: 'yahoo', label: 'Yahoo Mail' },
  { value: 'default', label: 'System Default' },
] as const;

export const getEmailClientPreference = (): EmailClient => {
  const stored = localStorage.getItem('emailClientPreference');
  if (stored && ['gmail', 'outlook', 'yahoo', 'default'].includes(stored)) {
    return stored as EmailClient;
  }
  return 'gmail';
};

export const setEmailClientPreference = (client: EmailClient): void => {
  localStorage.setItem('emailClientPreference', client);
};

export const getEmailLink = (email: string, client?: EmailClient, subject?: string): string => {
  const emailClient = client || getEmailClientPreference();
  const encodedEmail = encodeURIComponent(email);
  const encodedSubject = subject ? encodeURIComponent(subject) : '';
  
  switch (emailClient) {
    case 'gmail':
      return `https://mail.google.com/mail/?view=cm&to=${encodedEmail}${encodedSubject ? `&su=${encodedSubject}` : ''}`;
    case 'outlook':
      return `https://outlook.live.com/mail/0/deeplink/compose?to=${encodedEmail}${encodedSubject ? `&subject=${encodedSubject}` : ''}`;
    case 'yahoo':
      return `https://compose.mail.yahoo.com/?to=${encodedEmail}${encodedSubject ? `&subject=${encodedSubject}` : ''}`;
    case 'default':
    default:
      return `mailto:${email}${encodedSubject ? `?subject=${encodedSubject}` : ''}`;
  }
};

export const openEmailClient = (email: string, client?: EmailClient, subject?: string): void => {
  const link = getEmailLink(email, client, subject);
  window.open(link, '_blank');
};
