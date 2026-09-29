import type { Field, FieldType, FormDefinition } from "./schema";
export function newField(type: FieldType, id: string): Field {
  const base = { id, label: type === "nps" ? "How likely are you to recommend us?" : type[0]!.toUpperCase() + type.slice(1), description: "", required: false, width: "full" as const, condition: null };
  switch (type) {
    case "text": case "textarea": case "email": case "tel": case "url": case "date": return { ...base, type, placeholder: "", maxLength: type === "textarea" ? 5000 : 200 };
    case "number": return { ...base, type, min: 0, max: 100000, step: 1 };
    case "rating": return { ...base, type, min: 1, max: 5, step: 1 };
    case "nps": return { ...base, type, min: 0, max: 10, step: 1 };
    case "select": case "radio": case "checkboxes": return { ...base, type, options: [{ label: "First option", value: "first" }, { label: "Second option", value: "second" }] };
    case "calculation": return { ...base, type, operation: "sum", fields: [], decimals: 2 };
    case "signature": case "consent": case "section": case "page": return { ...base, type };
  }
}
export const templates: { id: string; title: string; description: string; definition: FormDefinition }[] = [
  { id: "contact", title: "Contact form", description: "A clear starting point for conversations.", definition: {
    schemaVersion: 1, title: "Get in touch", description: "Have a question? We’d love to hear from you.",
    fields: [{ ...newField("text", "name"), label: "Your name", required: true, width: "half" }, { ...newField("email", "email"), label: "Email address", required: true, width: "half" }, { ...newField("textarea", "message"), label: "How can we help?", required: true }],
    settings: { submitLabel: "Send message", confirmation: "Thank you. Your message has been received.", notifications: [], opensAt: null, closesAt: null, mode: "standard" },
  } },
  { id: "feedback", title: "Feedback survey", description: "Measure satisfaction with ratings and NPS.", definition: {
    schemaVersion: 1, title: "Tell us what you think", description: "Your feedback helps us improve.",
    fields: [{ ...newField("rating", "experience"), label: "How was your experience?", required: true }, newField("nps", "recommend"), { ...newField("textarea", "feedback"), label: "What could we do better?" }],
    settings: { submitLabel: "Share feedback", confirmation: "Thanks for helping us improve.", notifications: [], opensAt: null, closesAt: null, mode: "standard" },
  } },
  { id: "application", title: "Job application", description: "A two-step application with consent.", definition: {
    schemaVersion: 1, title: "Join our team", description: "We’d like to get to know you.",
    fields: [{ ...newField("text", "name"), label: "Full name", required: true }, { ...newField("email", "email"), label: "Email", required: true }, { ...newField("page", "background"), label: "Your background" }, { ...newField("textarea", "experience"), label: "Tell us about your experience", required: true }, { ...newField("consent", "consent"), label: "I agree to be contacted about my application", required: true }],
    settings: { submitLabel: "Send application", confirmation: "Your application has been received.", notifications: [], opensAt: null, closesAt: null, mode: "standard" },
  } },
  { id: "blank", title: "Blank form", description: "Start from a single field.", definition: {
    schemaVersion: 1, title: "Untitled form", description: "",
    fields: [{ ...newField("text", "name"), label: "Your name" }],
    settings: { submitLabel: "Submit", confirmation: "Thank you. Your response has been received.", notifications: [], opensAt: null, closesAt: null, mode: "standard" },
  } },
];
