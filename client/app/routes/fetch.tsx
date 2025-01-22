declare global {
  interface Window {
    ethereum?: any;
  }
}

"use client";
import { useState, useEffect, useRef } from "react";
import Web3 from "web3";
import { Button } from "~/components/ui/button";
import { Calendar, ChevronDown, Phone, Mail, CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { useToast } from "~/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import PatientRegistryABI from "./artifacts/PatientRegistry.json";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, query, orderByChild, equalTo } from "firebase/database";
import { redirect, useLoaderData } from "@remix-run/react";
import { firebaseConfig } from "firebaseConfig";
import CryptoJS from 'crypto-js';
import { json, LoaderFunction } from "@remix-run/node";
import { getAuth } from "@clerk/remix/ssr.server";
import { AbiItem } from 'web3-utils';
import { motion } from "framer-motion";
import { useUser } from "@clerk/remix";

export const loader: LoaderFunction = async (args) => {
  const { userId } = await getAuth(args);
  if (!userId) {
    return redirect('/sign-in');
  }

  return json({ firebaseConfig });
};

interface PatientData {
  firstName: string;
  lastName: string;
  age: number;
  gender: string;
  contactNumber: string;
  email: string;
  address: string;
  cancerType: string;
  blockchainAddress: string;
  diagnosedDate?: string;
  transactionHash?: string;
  [key: string]: any;
}

export default function FetchPatientData() {
  const { firebaseConfig } = useLoaderData<any>();
  const { isLoaded, isSignedIn, user } = useUser();
  const { toast } = useToast();
  const [address, setAddress] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [verificationResult, setVerificationResult] = useState<string>("");
  const [recordId, setRecordId] = useState<string>("");
  const [isVerifying, setIsVerifying] = useState(false);

  const app = initializeApp(firebaseConfig);
  const database = getDatabase(app);

  const [account, setAccount] = useState<string>('');
  const [patientRegistry, setPatientRegistry] = useState<any>(null);

  const verificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadBlockchainData();
  }, []);

  const loadBlockchainData = async () => {
    if (window.ethereum) {
      const web3 = new Web3(window.ethereum);
      try {
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        setAccount(accounts[0]);

        const networkId = await web3.eth.net.getId();
        const networkData = (PatientRegistryABI.networks as any)[networkId.toString()];

        if (networkData) {
          const registry = new web3.eth.Contract(PatientRegistryABI.abi as AbiItem[], networkData.address);
          setPatientRegistry(registry);
        } else {
          window.alert('The smart contract is not deployed to the current network');
        }
      } catch (error) {
        console.error("User denied account access", error);
      }
    } else {
      window.alert("Non-Ethereum browser detected. You should consider trying MetaMask!");
    }
  };

  // Add this utility function to encode emails
  const encodeEmail = (email: string) => {
    return email.replace(/\./g, ',');
  };

  // Use the encoded email for Firebase operations
  const fetchPatientData = async () => {
    if (!address.trim() && !name.trim()) {
      toast({
        title: "Error",
        description: "Please enter an address or name",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let dbRef: any;
      if (address.trim()) {
        // Query by blockchain address
        dbRef = query(ref(database, 'patients'), orderByChild('blockchainAddress'), equalTo(address.trim()));
      } else if (name.trim()) {
        // Query by name
        dbRef = query(ref(database, 'patients'), orderByChild('firstName'), equalTo(name));
      }

      if (!dbRef) return;

      const snapshot = await get(dbRef);

      if (snapshot.exists()) {
        const patientData = snapshot.val();
        // Assuming patientData is an object with keys as record IDs
        const firstKey = Object.keys(patientData)[0];
        const currentPatient = patientData[firstKey];

        // Fetch blockchain data
        const blockchainAddress = currentPatient.blockchainAddress;
        if (blockchainAddress && Web3.utils.isAddress(blockchainAddress)) {
          const record = await patientRegistry.methods.getPatientRecord(blockchainAddress).call();
          console.log("Retrieved blockchain data:", record);
          if (record) {
            currentPatient.diagnosedDate = new Date(record.timestamp * 1000).toLocaleString();
          }
        }

        setPatient(currentPatient); // Set the patient with combined data
        toast({
          title: "Success",
          description: "Patient data retrieved successfully",
        });
      } else {
        setPatient(null);
        toast({
          title: "Error",
          description: "No patient found with the provided information",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Error fetching data:", err);
      setError("Error fetching patient record");
      toast({
        title: "Error",
        description: "Failed to fetch patient data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  
  const generateHash = (data: any) => {
    const relevantData: { [key: string]: any } = {
      firstName: data.firstName,
      lastName: data.lastName,
      contactNumber: data.contactNumber,
      gender: data.gender,
      cancerType: data.cancerType,
      age: data.age,
      email: data.email,
      blockchainAddress: data.address,  // Store the address as an attribute
      timestamp: data.timestamp
    };
  
    const sortedData = Object.keys(relevantData).sort().reduce((result: { [key: string]: any }, key: string) => {
      result[key] = relevantData[key];
      return result;
    }, {});
  
    return CryptoJS.SHA256(JSON.stringify(sortedData)).toString();
  };
  
  const verifyDataIntegrity = async () => {
    if (!patientRegistry || !patient) return;
  
    const blockchainAddress = patient.blockchainAddress;
    if (!blockchainAddress || !Web3.utils.isAddress(blockchainAddress)) {
      toast({
        title: "Error",
        description: "Invalid blockchain address",
        variant: "destructive",
      });
      return;
    }
  
    setVerificationResult('');
    
    try {
      setIsVerifying(true);
      
      // Scroll to the verification section
      verificationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      const record = await patientRegistry.methods.getPatientRecord(blockchainAddress).call();
      console.log("Retrieved patient record from blockchain:", record);
  
      if (record) {
        // Compare the blockchain record with the local patient data
        const localHash = generateHash(patient);
        console.log("Local Hash:", localHash);
        console.log("Blockchain Hash:", record.dataHash);
  
        if (localHash === record.dataHash) {
          setVerificationResult('No alterations detected');
        } else {
          setVerificationResult('Data mismatch detected');
        }
      }
  
    } catch (error) {
      console.error("Error verifying data integrity:", error);
      toast({
        title: "Error",
        description: "Failed to verify data integrity",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // Call fetchPatientData with the user's email
  useEffect(() => {
    if (user) {
      fetchPatientData();
    }
  }, [user]);

  return (
    <div className="container mx-auto p-4 space-y-6 bg-background text-foreground">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Fetch Patient's Data</h1>
      </div>

      <div className="flex gap-4 mb-6">
        <Input
          placeholder="Enter Address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="max-w-md bg-input text-foreground"
        />
        <Input
          placeholder="Enter Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="max-w-md bg-input text-foreground"
        />
        <Button 
          onClick={fetchPatientData} 
          disabled={loading}
          className="bg-primary text-primary-foreground"
        >
          {loading ? "Searching..." : "Search"}
        </Button>
      </div>

      {error && (
        <div className="bg-destructive text-destructive-foreground px-4 py-3 rounded">
          {error}
        </div>
      )}

      {patient && (
        <Card className="bg-card text-card-foreground">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center space-x-4">
              <Avatar className="h-20 w-20">
                <AvatarImage alt={`${patient.firstName} ${patient.lastName}`} />
                <AvatarFallback>{patient.firstName?.[0]}{patient.lastName?.[0]}</AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-2xl">
                  {patient.firstName} {patient.lastName}
                </CardTitle>
                <CardDescription>
                  {patient.age} years old • {patient.gender}
                </CardDescription>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-popover text-popover-foreground">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem>Edit Patient Info</DropdownMenuItem>
                <DropdownMenuItem>View Medical Records</DropdownMenuItem>
                <DropdownMenuItem>Schedule Appointment</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Print Summary</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-sm">
                  <Phone className="h-4 w-4" />
                  <span>{patient.contactNumber}</span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <Mail className="h-4 w-4" />
                  <span>{patient.email}</span>
                </div>
                <div className="flex items-center space-x-2 text-sm">
                  <Calendar className="h-4 w-4" />
                  <span className="text-sm font-medium">Diagnosed Date:</span>
                  <span className="text-sm">{patient.diagnosedDate || 'N/A'}</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Cancer Type:</span>
                  <Badge variant="secondary" className="bg-secondary text-secondary-foreground">{patient.cancerType}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Transaction Hash:</span>
                  <Badge variant="outline" className="bg-muted text-muted-foreground">{patient.transactionHash || 'N/A'}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Patient ID:</span>
                  <Badge variant="outline" className="bg-muted text-muted-foreground">{patient.blockchainAddress}</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {patient && (
        <div className="space-y-4">
          <Button 
            onClick={verifyDataIntegrity} 
            disabled={isVerifying}
            className="mt-6 bg-primary text-primary-foreground"
          >
            {isVerifying ? "Verifying..." : "Verify Data Integrity"}
          </Button>

          <div ref={verificationRef}>
            {isVerifying && (
              <div className="mt-6 relative h-40 bg-secondary/20 rounded-lg overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="blockchain-animation flex items-center space-x-4">
                    {[...Array(5)].map((_, index) => (
                      <motion.div
                        key={index}
                        className="block w-12 h-12 bg-primary rounded-md flex items-center justify-center text-primary-foreground font-bold"
                        initial={{ scale: 1, x: -100, opacity: 0 }}
                        animate={{
                          scale: [1, 1.2, 1],
                          x: 0,
                          opacity: 1,
                        }}
                        transition={{
                          duration: 0.5,
                          delay: index * 0.2,
                          repeat: Infinity,
                          repeatDelay: 2
                        }}
                      >
                        {index + 1}
                      </motion.div>
                    ))}
                  </div>
                </div>
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/20 to-transparent"
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                />
              </div>
            )}

            {verificationResult && (
              <div className="mt-4 p-4 bg-muted text-muted-foreground border rounded space-y-2">
                <div className="flex items-center gap-2">
                  {verificationResult.includes('No alterations detected') ? (
                    <CheckCircle className="text-green-500" />
                  ) : (
                    <XCircle className="text-red-500" />
                  )}
                  <span className="font-medium">
                    {verificationResult.split('\n')[0]}
                  </span>
                </div>
                <pre className="mt-2 whitespace-pre-wrap text-sm">
                  {verificationResult.split('\n').slice(1).join('\n')}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}