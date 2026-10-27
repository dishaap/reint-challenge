import { useRef, useState } from 'react'
import './Dropdown.css'

export default function Dropdown({ label, selectedValue = '', children }) {
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef(null)

    function closeIfUnfocused() {
        if (!dropdownRef.current?.contains(document.activeElement)) {
            setIsOpen(false)
        }
    }

    return (
        <div
            ref={dropdownRef}
            className={`dropdown${isOpen ? ' open' : ''}`}
            onMouseLeave={closeIfUnfocused}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget) &&
                    !event.currentTarget.matches(':hover')) {
                    setIsOpen(false)
                }
            }}
        >
            <button
                type="button"
                className="dropdown-trigger"
                aria-expanded={isOpen}
                onClick={() => setIsOpen((open) => !open)}
            >
                <span className="dropdown-label">{label}</span>
                <span className="dropdown-value">{selectedValue}</span>
                <span className="dropdown-chevron" aria-hidden="true" />
            </button>
            <div className="dropdown-content" aria-hidden={!isOpen}>
                {children}
            </div>
        </div>
    )
}