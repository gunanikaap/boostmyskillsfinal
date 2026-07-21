import type { Appearance } from "@clerk/types";

/**
 * Brand styling for the embedded Clerk <SignIn>/<SignUp> so they blend into our
 * own auth card (the green two-panel layout in components/AuthShell). We provide
 * the card and the Register/Sign in toggle, so Clerk's own header/footer are
 * hidden and the primary button is BoostMySkills green.
 */
export const authAppearance: Appearance = {
  variables: {
    colorPrimary: "#079845",
    colorText: "#1a1a1a",
    colorTextSecondary: "#767676",
    borderRadius: "10px",
    fontFamily: "var(--font-urbanist), 'Segoe UI', system-ui, sans-serif",
    fontSize: "15px",
  },
  elements: {
    rootBox: { width: "100%" },
    cardBox: { width: "100%", boxShadow: "none", border: "none" },
    card: {
      width: "100%",
      boxShadow: "none",
      border: "none",
      padding: "0",
      background: "transparent",
    },
    header: { display: "none" },
    footer: { display: "none" },
    formButtonPrimary: {
      backgroundColor: "#079845",
      boxShadow: "none",
      textTransform: "none",
      fontSize: "15px",
      fontWeight: 700,
      padding: "12px 16px",
    },
    formFieldInput: { borderRadius: "10px", padding: "11px 13px" },
    socialButtonsBlockButton: { borderRadius: "999px" },
  },
};
