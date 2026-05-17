//labelled form-field wrapper - label on top, control beneath, optional hint
export default function Field({ label, hint, children }){
    return (
        <label className="field">
            <span className="field__label">{label}</span>
            {children}
            {hint && <span className="field__hint">{hint}</span>}
        </label>
    );
}
