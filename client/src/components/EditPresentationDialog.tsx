import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";

interface EditPresentationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTitle: string;
  onSave: (newTitle: string) => void;
}

export function EditPresentationDialog({
  open,
  onOpenChange,
  currentTitle,
  onSave,
}: EditPresentationDialogProps) {
  const [title, setTitle] = useState(currentTitle);

  const handleSave = () => {
    if (title.trim()) {
      onSave(title.trim());
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-edit-presentation">
        <DialogHeader>
          <DialogTitle>Edit Presentation</DialogTitle>
          <DialogDescription>
            Update the title of your presentation
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Presentation Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter presentation title"
              data-testid="input-title"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button onClick={handleSave} data-testid="button-save">
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
