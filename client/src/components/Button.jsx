//primary (dark fill) and secondary (white fill) buttons in the design language
//both accept an optional leading icon

export function PrimaryButton({ icon, children, ...rest }){
    return (
        <button className="btn-primary" {...rest}>
            {icon && <span className="btn-primary__icon" aria-hidden="true">{icon}</span>}
            <span>{children}</span>
        </button>
    );
}

export function SecondaryButton({ icon, children, ...rest }){
    return (
        <button className="btn-secondary" {...rest}>
            {icon && <span className="btn-primary__icon" aria-hidden="true">{icon}</span>}
            <span>{children}</span>
        </button>
    );
}
