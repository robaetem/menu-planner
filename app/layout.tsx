import {
  ClerkProvider,
  Show,
  SignInButton,
  UserButton,
} from "@clerk/nextjs";
import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider>
          <header>
            <Show when="signed-out">
              <SignInButton forceRedirectUrl="/" signUpForceRedirectUrl="/" />
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </header>
          <main>{children}</main>
        </ClerkProvider>
      </body>
    </html>
  );
}
