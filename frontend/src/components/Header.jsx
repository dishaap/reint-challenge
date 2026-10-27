import { useState } from 'react'

export default function Header({ title, menu }) {
    const [activeItem, setActiveItem] = useState(menu[0] ?? null)

    return(
        <div className="header">
            <h1 className="page-title">{title}</h1>
            <div className="header-menu">
                {menu.map((item) => (
                    <button
                        key={item}
                        type="button"
                        className={`header-menu-item${activeItem === item ? ' active' : ''}`}
                        aria-pressed={activeItem === item}
                        onClick={() => setActiveItem(item)}
                    >
                        {item}
                    </button>
                ))}
            </div>
        </div>
    )
}