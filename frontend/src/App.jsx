import { useState } from 'react'
import './App.css'
import Header from './components/Header.jsx'
import About from './pages/About.jsx'
import Accuracy from './pages/Accuracy.jsx'
import DayAheadView from './pages/DayAheadView.jsx'

function App() {
    const menu = ["Day-Ahead View", "Accuracy", "About"]
    const [activePage, setActivePage] = useState(menu[0])

    const pages = {
        "Day-Ahead View": <DayAheadView />,
        Accuracy: <Accuracy />,
        About: <About />,
    }

    return (
        <>
            <Header
                menu={menu}
                activeItem={activePage}
                onSelect={setActivePage}
            />
            <main className="page-content">
                {pages[activePage]}
            </main>
        </>
    )
}

export default App
