"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createEmployeeAction, updateEmployeeAction } from "../actions/hr.actions";

export interface EmployeeRow {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  designation: string | null;
  joinDate: Date | string;
  exitDate: Date | string | null;
  salaryType: string;
  salaryBase: number;
  hourlyRate: number;
  bankAccount: string | null;
  isActive: boolean;
}

interface Props {
  open: boolean;
  employee?: EmployeeRow;
  onClose: () => void;
}

export function EmployeeDialog({ open, employee, onClose }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [employeeCode, setEmployeeCode] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [joinDate, setJoinDate] = useState("");
  const [salaryType, setSalaryType] = useState<string>("MONTHLY");
  const [salaryBase, setSalaryBase] = useState("0");
  const [hourlyRate, setHourlyRate] = useState("0");
  const [bankAccount, setBankAccount] = useState("");

  useEffect(() => {
    if (!open) return;
    setEmployeeCode(employee?.employeeCode ?? "");
    setFirstName(employee?.firstName ?? "");
    setLastName(employee?.lastName ?? "");
    setEmail(employee?.email ?? "");
    setPhone(employee?.phone ?? "");
    setDepartment(employee?.department ?? "");
    setDesignation(employee?.designation ?? "");
    setJoinDate(
      employee ? new Date(employee.joinDate).toISOString().split("T")[0] : "",
    );
    setSalaryType(employee?.salaryType ?? "MONTHLY");
    setSalaryBase(employee ? String(employee.salaryBase) : "0");
    setHourlyRate(employee ? String(employee.hourlyRate) : "0");
    setBankAccount(employee?.bankAccount ?? "");
  }, [open, employee]);

  const submit = () =>
    startTransition(async () => {
      const input = {
        employeeCode,
        firstName,
        lastName,
        email,
        phone,
        department,
        designation,
        joinDate,
        salaryType,
        salaryBase: Number(salaryBase),
        hourlyRate: Number(hourlyRate),
        bankAccount,
      };
      const result = employee
        ? await updateEmployeeAction(employee.id, input)
        : await createEmployeeAction(input);
      if (result.ok) {
        toast.success(employee ? "Employee updated" : "Employee added");
        onClose();
        router.refresh();
      } else {
        const fields = result.error.fields;
        toast.error(
          fields?.employeeCode || fields?.firstName || fields?.hourlyRate || result.error.message,
        );
      }
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{employee ? "Edit employee" : "Add employee"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="e-code">Employee code *</Label>
              <Input
                id="e-code"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-join">Join date *</Label>
              <Input
                id="e-join"
                type="date"
                value={joinDate}
                onChange={(e) => setJoinDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="e-first">First name *</Label>
              <Input
                id="e-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-last">Last name *</Label>
              <Input
                id="e-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="e-email">Email</Label>
              <Input
                id="e-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-phone">Phone</Label>
              <Input
                id="e-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="e-dept">Department</Label>
              <Input
                id="e-dept"
                placeholder="Kitchen"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e-desig">Designation</Label>
              <Input
                id="e-desig"
                placeholder="Chef"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="e-saltype">Salary type *</Label>
            <Select value={salaryType} onValueChange={(value) => setSalaryType(value ?? "MONTHLY")}>
              <SelectTrigger id="e-saltype">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MONTHLY">Monthly</SelectItem>
                <SelectItem value="HOURLY">Hourly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="e-base">
                {salaryType === "MONTHLY" ? "Monthly salary" : "Base amount"}
              </Label>
              <Input
                id="e-base"
                type="number"
                step="0.01"
                min="0"
                value={salaryBase}
                onChange={(e) => setSalaryBase(e.target.value)}
              />
            </div>
            {salaryType === "HOURLY" && (
              <div className="space-y-2">
                <Label htmlFor="e-rate">Hourly rate *</Label>
                <Input
                  id="e-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="e-bank">Bank account</Label>
            <Input
              id="e-bank"
              value={bankAccount}
              onChange={(e) => setBankAccount(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={
              pending ||
              !employeeCode.trim() ||
              !firstName.trim() ||
              !lastName.trim() ||
              !joinDate
            }
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {employee ? "Update" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
