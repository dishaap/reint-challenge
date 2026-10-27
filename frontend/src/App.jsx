import './App.css'
import Header from './components/Header.jsx'

function App() {
    const menu = ["Day-Ahead View", "Accuracy", "About"]
    return (
        <Header title="Day-Ahead View" menu={menu} />
    )
}

export default App
