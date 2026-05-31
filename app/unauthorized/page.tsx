import { SignOutButton } from "@clerk/nextjs";

export default function Unauthorized() {
  return (
    <div>
      <h1>Access restricted</h1>
      <p>
        This is a private app and your account isn&apos;t on the invite list.
        If you think this is a mistake, ask the owner to add your email.
      </p>
      <SignOutButton>
        <button>Sign out</button>
      </SignOutButton>
    </div>
  );
}
