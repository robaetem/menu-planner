export {};

declare global {
  // Adds the custom claim we (optionally) map in the Clerk dashboard under
  // "Customize session token": { "primaryEmail": "{{user.primary_email_address}}" }
  interface CustomJwtSessionClaims {
    primaryEmail?: string;
  }
}
