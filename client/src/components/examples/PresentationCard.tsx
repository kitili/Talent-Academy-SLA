import { PresentationCard } from '../PresentationCard'

export default function PresentationCardExample() {
  return (
    <div className="max-w-sm">
      <PresentationCard
        id="1"
        title="Introduction to Teaching Methods"
        fileName="teaching-methods.pptx"
        fileSize={2500000}
        fileType=".pptx"
        uploadedAt={new Date('2024-01-15')}
        onEdit={(id) => console.log('Edit clicked', id)}
        onDelete={(id) => console.log('Delete clicked', id)}
      />
    </div>
  )
}
