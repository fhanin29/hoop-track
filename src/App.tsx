import { createHashRouter, RouterProvider } from 'react-router'
import { Root, Layout } from './components/Layout'
import Dashboard from './pages/Dashboard'
import Players from './pages/Players'
import PlayerDetail from './pages/PlayerDetail'
import Games from './pages/Games'
import GameDetail from './pages/GameDetail'
import LiveGame from './pages/LiveGame'
import TeamStats from './pages/TeamStats'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'

const router = createHashRouter([
  {
    element: <Root />,
    children: [
      { path: 'matchs/:id/live', element: <LiveGame /> },
      {
        element: <Layout />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: 'joueurs', element: <Players /> },
          { path: 'joueurs/:id', element: <PlayerDetail /> },
          { path: 'matchs', element: <Games /> },
          { path: 'matchs/:id', element: <GameDetail /> },
          { path: 'stats', element: <TeamStats /> },
          { path: 'reglages', element: <Settings /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
