import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ContactForm from "@/components/ContactForm";

export const metadata = { title: "Contact" };

const LINKEDIN_URL = "https://www.linkedin.com/company/res4city/posts/?feedView=all";

function LinkedInIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4.98 3.5A2.5 2.5 0 002.5 6a2.5 2.5 0 002.48 2.5A2.5 2.5 0 007.5 6a2.5 2.5 0 00-2.52-2.5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-.95 1.83-1.95 3.76-1.95C20.2 8.75 21 11 21 14.1V21h-4v-6.1c0-1.46-.03-3.33-2.03-3.33-2.03 0-2.34 1.58-2.34 3.22V21H9z" />
    </svg>
  );
}

export default function ContactPage() {
  return (
    <>
      <SiteHeader />
      <main className="container contact">
        <div className="contact__intro">
          <h1>Let&rsquo;s get in touch!</h1>
          <p>Contact us if you have questions about BoostMySkills.</p>
          <div className="contact__follow">
            <strong>Follow us</strong>
            <a
              href={LINKEDIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="BoostMySkills on LinkedIn"
              className="contact__social"
            >
              <LinkedInIcon />
            </a>
          </div>
        </div>
        <div className="contact__form">
          <ContactForm />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
