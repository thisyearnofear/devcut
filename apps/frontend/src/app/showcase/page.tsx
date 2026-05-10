import { redirect } from "next/navigation";

// The component showcase is for the leads demo (upstream starter kit).
// For the Runway API Hackathon submission, redirect to the about page.
export default function ShowcasePage() {
  redirect("/about");
}
