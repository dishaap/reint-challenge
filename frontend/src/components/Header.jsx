export default function Header({ menu, activeItem, onSelect }) {
    return(
        <div className="header">
            <h1 className="page-title">{activeItem}</h1>
            <div className="header-menu">
                {menu.map((item) => (
                    <button
                        key={item}
                        type="button"
                        className={`header-menu-item${activeItem === item ? ' active' : ''}`}
                        aria-pressed={activeItem === item}
                        onClick={() => onSelect(item)}
                    >
                        {item}
                    </button>
                ))}
            </div>
        </div>
    )
}