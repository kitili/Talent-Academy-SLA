import { DeleteConfirmDialog } from '../DeleteConfirmDialog'
import { useState } from 'react'

export default function DeleteConfirmDialogExample() {
  const [open, setOpen] = useState(true);

  return (
    <DeleteConfirmDialog
      open={open}
      onOpenChange={setOpen}
      presentationTitle="Introduction to Teaching Methods"
      onConfirm={() => console.log('Confirmed delete')}
    />
  )
}
