# Session-Based File Management Proposal

## 🎯 **Objective**
Allow users to track and manage their uploaded files within a browser session, including premature deletion capability.

## 🔧 **Implementation Approach**

### **Frontend (Browser Storage)**
```typescript
// Store uploaded files in sessionStorage
interface SessionFile {
  id: string;
  filename: string;
  uploadDate: string;
  expiresAt: string;
  downloadUrl: string;
  size: number;
  canDelete: boolean;
}

class SessionFileManager {
  private static STORAGE_KEY = 'whirlcrypt_session_files';
  
  static addFile(file: SessionFile): void {
    const files = this.getFiles();
    files.push(file);
    sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(files));
  }
  
  static getFiles(): SessionFile[] {
    const stored = sessionStorage.getItem(this.STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  }
  
  static removeFile(fileId: string): void {
    const files = this.getFiles().filter(f => f.id !== fileId);
    sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(files));
  }
}
```

### **Backend API Enhancement**
```typescript
// Add delete endpoint for file owners
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const fileId = req.params.id;
    const fileManager = getFileManager();
    
    // Verify file exists and is active
    const metadata = await fileManager.getFileMetadata(fileId);
    if (!metadata) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Delete the file
    const deleted = await fileManager.deleteFile(fileId);
    
    if (deleted) {
      res.json({ message: 'File deleted successfully' });
    } else {
      res.status(500).json({ error: 'Failed to delete file' });
    }
    
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

### **UI Components**
```tsx
// Session Files Panel Component
const SessionFilesPanel: React.FC = () => {
  const [sessionFiles, setSessionFiles] = useState<SessionFile[]>([]);
  
  useEffect(() => {
    setSessionFiles(SessionFileManager.getFiles());
  }, []);
  
  const handleDelete = async (fileId: string) => {
    try {
      const response = await fetch(`/api/files/${fileId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        SessionFileManager.removeFile(fileId);
        setSessionFiles(SessionFileManager.getFiles());
        toast.success('File deleted successfully');
      }
    } catch (error) {
      toast.error('Failed to delete file');
    }
  };
  
  return (
    <div className="session-files-panel">
      <h3>Your Files This Session</h3>
      {sessionFiles.map(file => (
        <FileCard 
          key={file.id} 
          file={file} 
          onDelete={() => handleDelete(file.id)}
        />
      ))}
    </div>
  );
};
```

## 🎨 **UI/UX Features**
- Collapsible sidebar showing session files
- File cards with upload time, expiry countdown
- One-click delete with confirmation
- Visual indicators for file status
- Automatic cleanup of expired entries

## 🔒 **Security Considerations**
- No authentication required (session-based only)
- Files can only be deleted, not modified
- Session storage cleared on browser close
- No server-side session tracking (privacy-focused)

## 📱 **Mobile Responsive**
- Swipe-to-delete on mobile
- Compact file cards for small screens
- Touch-friendly delete buttons

## 🚀 **Implementation Priority**
This would be a great next feature because:
- Enhances user experience significantly
- Maintains zero-knowledge architecture
- Relatively simple to implement
- Showcases thoughtful UX design
