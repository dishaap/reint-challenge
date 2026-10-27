import { useState } from 'react'
import './App.css'
import Header from './components/Header.jsx'
import Accuracy from './pages/Accuracy.jsx'
import DayAheadView from './pages/DayAheadView.jsx'

function createInitialFilters() {
    return {
        dates: {},
        cutoffTime: '',
        history: 'All available',
        percentiles: { lower: 5, upper: 95 },
    }
}

function App() {
    const menu = ["Day-Ahead View", "Accuracy"]
    const [activePage, setActivePage] = useState(menu[0])
    const [filtersByView, setFiltersByView] = useState({
        'day-ahead': createInitialFilters(),
        accuracy: createInitialFilters(),
    })

    function updateFilters(view, updates) {
        const updatedViewFilters = {
            ...filtersByView[view],
            ...updates,
        }

        console.log(`Updated ${view} filters:`, updatedViewFilters)

        setFiltersByView((currentFilters) => ({
            ...currentFilters,
            [view]: {
                ...currentFilters[view],
                ...updates,
            },
        }))
    }

    const pages = {
        "Day-Ahead View": (
            <DayAheadView
                filters={filtersByView['day-ahead']}
                onFiltersChange={(updates) => updateFilters('day-ahead', updates)}
            />
        ),
        Accuracy: (
            <Accuracy
                filters={filtersByView.accuracy}
                onFiltersChange={(updates) => updateFilters('accuracy', updates)}
            />
        ),
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
