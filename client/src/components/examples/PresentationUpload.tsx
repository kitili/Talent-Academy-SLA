import { PresentationUpload } from '../PresentationUpload'

export default function PresentationUploadExample() {
  const handleUpload = (file: File) => {
    console.log('File uploaded:', file.name);
  };

  return <PresentationUpload onUpload={handleUpload} />
}
