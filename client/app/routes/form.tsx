"use client";

import React, { useState, useEffect } from "react";
import Web3 from "web3";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "~/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { toast } from "~/hooks/use-toast";
import PatientRegistryABI from "./artifacts/PatientRegistry.json";
import CryptoJS from 'crypto-js';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set } from "firebase/database";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { firebaseConfig } from "firebaseConfig"; 
import { redirect, LoaderFunction, json} from "@remix-run/node";
import { getAuth } from '@clerk/remix/ssr.server';
import * as z from "zod"

const formSchema = z.object({
    address: z.string().min(10, {
      message: "First name must be at least 10 digits.",
    }),
    firstName: z.string().min(2, {
      message: "First name must be at least 2 characters.",
    }),
    lastName: z.string().min(2, {
      message: "Last name must be at least 2 characters.",
    }),
    gender: z.string({
      required_error: "Please select a gender.",
    }),
    contactNumber: z.string().min(10, {
      message: "Contact number must be at least 10 digits.",
    }),
    cancerType: z.string({
      required_error: "Please select a cancer type.",
    }),
    age: z.string().min(1, {
      message: "Age is required.",
    }),
    email: z.string().email({
      message: "SUPER VALID email address.",
    }),
})

// export { firebaseLoader as loader };
export const loader: LoaderFunction = async (args) => {
  const { userId } = await getAuth(args);
  if (!userId) {
    return redirect('/sign-in');
  }

  return json({ firebaseConfig });
};

export default function NewPatientForm() {
  const { firebaseConfig } = useLoaderData<any>();
  const [account, setAccount] = useState<string>('');
  const [patientRegistry, setPatientRegistry] = useState<any>(null);
  const [searchParams] = useSearchParams(); // Use useSearchParams to access query parameters

  // Extract patient data from query parameters
  const initialValues = {
    address: searchParams.get("address") || "",
    firstName: searchParams.get("firstName") || "",
    lastName: searchParams.get("lastName") || "",
    age: searchParams.get("age") || "",
    gender: searchParams.get("gender") || "",
    contactNumber: searchParams.get("contactNumber") || "",
    email: searchParams.get("email") || "",
    cancerType: searchParams.get("cancerType") || "",
  };
  console.log("initial value:",initialValues)

  const app = initializeApp(firebaseConfig);
  const database = getDatabase(app);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: initialValues, // Set initial values from query parameters
    
  });

  useEffect(() => {
    loadBlockchainData();
  }, []);

  const loadBlockchainData = async () => {
    if (window.ethereum) {
      const web3 = new Web3(window.ethereum);
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const accounts = await web3.eth.getAccounts();
      setAccount(accounts[0]);

      const networkId = await web3.eth.net.getId();
      const networkData = PatientRegistryABI.networks[networkId];

      if (networkData) {
        const registry = new web3.eth.Contract(PatientRegistryABI.abi, networkData.address);
        setPatientRegistry(registry);
      } else {
        window.alert('The smart contract is not deployed to the current network');
      }
    } else {
      window.alert("Non-Ethereum browser detected. You should consider trying MetaMask!");
    }
  };

  const generateHash = (data: any) => {
    const sortedData = Object.keys(data).sort().reduce((result: any, key: string) => {
      result[key] = data[key];
      return result;
    }, {});
    return CryptoJS.SHA256(JSON.stringify(sortedData)).toString();
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!patientRegistry) {
      console.error("Contract is not initialized");
      return;
    }

    const patientData = {
      firstName: values.firstName,
      lastName: values.lastName,
      contactNumber: values.contactNumber,
      gender: values.gender,
      cancerType: values.cancerType,
      age: values.age,  // Include new field
      email: values.email,  // Include new field
      timestamp: Math.floor(Date.now() / 1000)
    };

    const dataHash = generateHash(patientData);

    try {
      // Store data in Firebase using patient address as the key
      const dbRef = ref(database, `patients/${values.address}`);
      await set(dbRef, patientData);

      // Register patient on blockchain with hash
      const receipt = await patientRegistry.methods.registerPatient(
        values.address,  // patient address as identifier
        dataHash
      ).send({ from: account });

      console.log("Transaction successful with hash:", receipt.transactionHash);

      // Store the transaction hash in Firebase
      await set(ref(database, `patients/${values.address}/transactionHash`), receipt.transactionHash);

      toast({
        title: "New patient data submitted",
        description: "The form was submitted successfully.",
      });
    } catch (error) {
      console.error("Error submitting form:", error);
      toast({
        title: "Error",
        description: `There was an error submitting the form: ${error.message}`,
      });
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 bg-white shadow rounded-lg">
      <h1 className="text-2xl font-bold mb-6">New Cancer Patient Registration</h1>
      <Form {...form} >
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Address</FormLabel>
                <FormControl>
                  <Input placeholder="Address" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First name</FormLabel>
                  <FormControl>
                    <Input placeholder="First name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last name</FormLabel>
                  <FormControl>
                    <Input placeholder="Last name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-full">
            <FormField 
              control={form.control}
              name="contactNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact number</FormLabel>
                  <FormControl>
                    <Input placeholder="011-12345678" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField 
              control={form.control}
              name="gender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gender</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="age"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Age</FormLabel>
                  <FormControl>
                    <Input placeholder="Age" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input placeholder="Email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="cancerType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cancer Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select cancer type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="breast">Breast Cancer</SelectItem>
                    <SelectItem value="lung">Lung Cancer</SelectItem>
                    <SelectItem value="prostate">Prostate Cancer</SelectItem>
                    <SelectItem value="colorectal">Colorectal Cancer</SelectItem>
                    <SelectItem value="melanoma">Melanoma</SelectItem>
                    <SelectItem value="leukemia">Leukemia</SelectItem>
                    <SelectItem value="lymphoma">Lymphoma</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit">Submit</Button>
        </form>
      </Form>
    </div>
  );
}