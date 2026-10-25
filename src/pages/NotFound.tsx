import { Link } from 'react-router'
import { EmptyState, Button } from '../components/ui'
import { SearchX } from 'lucide-react'

export default function NotFound() {
  return (
    <EmptyState icon={<SearchX size={48} />} title="Page introuvable">
      <Link to="/">
        <Button variant="primary" className="mt-2">Retour à l’accueil</Button>
      </Link>
    </EmptyState>
  )
}
