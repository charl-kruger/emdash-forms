import { useEffect, useId, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { z } from "zod";
import { calculated, definitionSchema, visible, validateAnswers } from "@emdash-forms/plugin/schema";
import type { Answer, Answers, Field, FormDefinition } from "@emdash-forms/plugin/schema";
import { connect, FormsError, message, request } from "./client";
import "./styles.css";

function Signature({ value, onChange, id }: { value: Answer | undefined; onChange: (value: Answer) => void; id: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const point = (event: PointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX-rect.left)*600/rect.width, y: (event.clientY-rect.top)*180/rect.height }; };
  const context = () => { const ctx = canvas.current?.getContext("2d"); if (!ctx) throw new Error("Canvas is unavailable"); return ctx; };
  return <div><canvas id={id} aria-label="Draw your signature using a pointer" ref={canvas} width={600} height={180} className="fs-signature" onPointerDown={event => { drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId); const ctx = context(); const p = point(event); ctx.beginPath(); ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.moveTo(p.x,p.y); }} onPointerMove={event => { if (!drawing.current) return; const ctx = context(); const p = point(event); ctx.lineTo(p.x,p.y); ctx.stroke(); }} onPointerUp={() => { drawing.current = false; if (canvas.current) onChange(canvas.current.toDataURL("image/png")); }} />
  <button type="button" className="fs-text-button" onClick={() => { context().clearRect(0,0,600,180); onChange(""); }}>Clear signature</button>
  <span className="fs-muted">{typeof value === "string" && value.length > 0 ? "Signature captured" : "Draw in the box"}</span></div>;
}
export function FieldInput({ field, value, onChange, preview = false, error }: { field: Field; value: Answer | undefined; onChange: (value: Answer) => void; preview?: boolean; error?: string }) {
  const uid = useId(); const id = `field-${uid}`;
  if (field.type === "page") return <div className="fs-page-marker">Next page · {field.label}</div>;
  if (field.type === "section") return <div className="fs-section"><h3>{field.label}</h3><p>{field.description}</p></div>;
  const common = { id, disabled: preview, "aria-invalid": Boolean(error), "aria-describedby": `${id}-help`, required: field.required };
  let control;
  if (field.type === "calculation") control = <output id={id}>{typeof value === "number" ? value.toFixed(field.decimals) : "—"}</output>;
  else if (field.type === "consent") control = <label className="fs-choice"><input {...common} type="checkbox" checked={value === true} onChange={e => onChange(e.target.checked)} />{field.label}</label>;
  else if (field.type === "signature") control = preview ? <div className="fs-signature-preview">Draw your signature here</div> : <Signature id={id} value={value} onChange={onChange} />;
  else if ("options" in field) {
    if (field.type === "select") control = <select {...common} value={typeof value === "string" ? value : ""} onChange={e => onChange(e.target.value)}><option value="">Select an option</option>{field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
    else control = <div className="fs-choices" role="group" aria-labelledby={`${id}-label`}>{field.options.map(o => <label className="fs-choice" key={o.value}><input disabled={preview} type={field.type === "radio" ? "radio" : "checkbox"} name={id} value={o.value} checked={field.type === "radio" ? value === o.value : Array.isArray(value) && value.includes(o.value)} onChange={e => { if (field.type === "radio") onChange(o.value); else { const values = Array.isArray(value) ? value : []; onChange(e.target.checked ? [...values,o.value] : values.filter(v => v !== o.value)); } }} />{o.label}</label>)}</div>;
  } else if ("min" in field) control = field.type === "number" ? <input {...common} type="number" min={field.min} max={field.max} step={field.step} value={typeof value === "number" ? value : ""} onChange={e => onChange(e.target.value === "" ? "" : e.target.valueAsNumber)} /> : <div className="fs-rating" role="group" aria-labelledby={`${id}-label`}>{Array.from({ length: field.max - field.min + 1 }, (_,i) => i+field.min).map(n => <button type="button" disabled={preview} key={n} aria-pressed={value === n} className={value === n ? "selected" : ""} onClick={() => onChange(n)}>{field.type === "rating" ? `${n} ★` : n}</button>)}</div>;
  else if ("maxLength" in field) control = field.type === "textarea" ? <textarea {...common} rows={4} maxLength={field.maxLength} placeholder={field.placeholder} value={typeof value === "string" ? value : ""} onChange={e => onChange(e.target.value)} /> : <input {...common} type={field.type} maxLength={field.maxLength} placeholder={field.placeholder} value={typeof value === "string" ? value : ""} onChange={e => onChange(e.target.value)} />;
  else throw new Error("Unsupported field type");
  return <div className={`fs-field fs-${field.width}`}>{field.type !== "consent" && <label id={`${id}-label`} htmlFor={id}>{field.label}{field.required && <span className="fs-required"> *</span>}</label>}{control}<small id={`${id}-help`} className={error ? "fs-field-error" : "fs-muted"}>{error ? error : field.description}</small></div>;
}
function normalized(form: FormDefinition, input: Answers): Answers {
  const result: Answers = {};
  for (const field of form.fields) {
    if (!visible(field,result)) continue;
    if (field.type === "calculation") { const number = calculated(field,result); if (number !== undefined) result[field.id] = number; }
    else { const value = input[field.id]; if (value !== undefined) result[field.id] = value; }
  }
  return result;
}
export function FormPreview({ definition }: { definition: FormDefinition }) {
  const [viewport, setViewport] = useState("desktop");
  const [session, setSession] = useState(0);
  return <section className="fs-preview" aria-label="Interactive form preview">
    <div className="fs-preview-toolbar"><div role="group" aria-label="Preview size">
      {["desktop", "mobile"].map(size => <button type="button" key={size} aria-pressed={viewport === size} className="fs-secondary" onClick={() => setViewport(size)}>{size === "desktop" ? "Desktop" : "Mobile"}</button>)}
    </div><button type="button" className="fs-text-button" onClick={() => setSession(s => s + 1)}>Reset preview</button></div>
    <p className="fs-muted">Try your form. Validation, calculations and conditions are live. No responses are saved or emails sent.</p>
    <div className={`fs-preview-device fs-preview-${viewport}`}><PublicForm key={session} formId="preview" previewDefinition={definition} /></div>
  </section>;
}
export default function PublicForm({ formId, previewDefinition }: { formId: string; previewDefinition?: FormDefinition }) {
  const [loaded, setLoaded] = useState<{ form: FormDefinition; engine: string; ticket: string }>();
  const [error, setError] = useState(""); const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<Record<string,string>>({}); const [step,setStep] = useState(0);
  const [busy,setBusy] = useState(false); const [complete,setComplete] = useState(false); const website = useRef<HTMLInputElement>(null);
  useEffect(() => { if (previewDefinition) { setLoaded({ form: previewDefinition, engine: "", ticket: "" }); return; } let active = true; void (async () => {
    try {
      const engine = await connect();
      const response = await request(engine,"definition",{ id: formId },z.object({ definition: definitionSchema, version: z.number() }),true);
      const ticket = await request(engine,"ticket",{ id: formId },z.object({ ticket: z.string(), version: z.number() }));
      if (ticket.version !== response.version) throw new Error("The form changed while loading. Reload the page.");
      if (active) setLoaded({ form: response.definition, engine, ticket: ticket.ticket });
    } catch (cause) { if (active) setError(message(cause)); }
  })(); return () => { active = false; }; },[formId, previewDefinition]);
  if (!loaded) return <div className="forms-public" role="status">{error || "Loading form…"}</div>;
  const form = loaded.form; const values = normalized(form,answers);
  if (complete) return <div className="forms-public fs-complete" role="status"><span>✓</span><h2>Thank you</h2><p>{form.settings.confirmation}</p></div>;
  const pages: Field[][] = [[]];
  for (const field of form.fields) {
    if (!visible(field,values)) continue;
    if (field.type === "page") { pages.push([]); continue; }
    let page = pages[pages.length-1]; if (!page) throw new Error("Missing form page");
    if (form.settings.mode === "conversational" && page.length) { page = []; pages.push(page); }
    page.push(field);
  }
  const nonempty = pages.filter(p => p.length > 0); const current = nonempty[step];
  if (!current) return <div className="forms-public" role="alert">Form steps changed. <button type="button" onClick={() => setStep(0)}>Start from the first step</button></div>;
  const inputValues: Answers = {};
  for (const f of form.fields) { const value = values[f.id]; if (value !== undefined && f.type !== "calculation") inputValues[f.id] = value; }
  const next = () => { const result = validateAnswers(form,inputValues); const e = result.ok ? {} : Object.fromEntries(Object.entries(result.errors).filter(([id]) => current.some(f => f.id === id))); setErrors(e); if (Object.keys(e).length === 0) setStep(step+1); };
  return <div className="forms-public"><div className="fs-public-heading"><h2>{form.title}</h2><p>{form.description}</p></div>{nonempty.length>1 && <div className="fs-progress"><span>Step {step+1} of {nonempty.length}</span><progress value={step+1} max={nonempty.length} /></div>}
    <form noValidate onSubmit={async event => {
      event.preventDefault(); if (step < nonempty.length-1) { next(); return; }
      const checked = validateAnswers(form,inputValues); if (!checked.ok) { setErrors(checked.errors); const first = nonempty.findIndex(p => p.some(f => checked.errors[f.id])); if (first>=0) setStep(first); return; }
      setBusy(true); setError("");
      try { if (!previewDefinition) await request(loaded.engine,"submit",{ formId,ticket:loaded.ticket,answers:inputValues,website:website.current ? website.current.value : "" }, z.object({ accepted: z.literal(true) })); setComplete(true); }
      catch (cause) { setError(message(cause)); if (cause instanceof FormsError) setErrors(cause.fields); }
      finally { setBusy(false); }
    }}>
      <div className="fs-honey" aria-hidden="true"><label>Leave this empty<input name="website" autoComplete="off" tabIndex={-1} ref={website} /></label></div>
      <div className="fs-grid">{current.map(f => <FieldInput key={f.id} field={f} value={values[f.id]} error={errors[f.id]} onChange={v => setAnswers(previous => ({ ...previous,[f.id]:v }))} />)}</div>
      {error && <p className="fs-error" role="alert">{error}</p>}
      <div className="fs-form-actions">{step>0 && <button type="button" disabled={busy} className="fs-secondary" onClick={() => setStep(step-1)}>Back</button>}<button className="fs-primary" type="submit" disabled={busy}>{busy ? "Submitting…" : step<nonempty.length-1 ? "Continue →" : form.settings.submitLabel}</button></div>
    </form><p className="fs-powered">Made with Forms Studio</p></div>;
}
