import React, { createContext, useContext, useState, ReactNode } from 'react';

interface UploadContextType {
  isUploading: boolean;
  setIsUploading: (uploading: boolean) => void;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export const useUpload = () => {
  const context = useContext(UploadContext);
  if (context === undefined) {
    throw new Error('useUpload must be used within an UploadProvider');
  }
  return context;
};

interface UploadProviderProps {
  children: ReactNode;
}

export const UploadProvider: React.FC<UploadProviderProps> = ({ children }) => {
  const [isUploading, setIsUploading] = useState(false);

  return (
    <UploadContext.Provider value={{ isUploading, setIsUploading }}>
      {children}
    </UploadContext.Provider>
  );
};