import { EditPresentationDialog } from '../EditPresentationDialog'
import { useState } from 'react'

export default function EditPresentationDialogExample() {
  const [open, setOpen] = useState(true);

  return (
    <EditPresentationDialog
      open={open}
      onOpenChange={setOpen}
      currentTitle="Introduction to Teaching Methods"
      onSave={(newTitle) => console.log('New title:', newTitle)}
    />
  )
}
