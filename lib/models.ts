import type { Timestamp } from "firebase/firestore";

export type UserRole = "technician" | "property_admin" | "property_manager" | "owner";
export type AccountStatus = "pending_admin" | "pending_owner" | "approved" | "rejected";
export type PropertyChangeStatus = "pending" | "approved" | "rejected";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "needs_info";
export type IssueStatus = "open" | "monitoring" | "closed";
export type MaintenanceStatus = "scheduled" | "in_progress" | "completed" | "overdue";
export type PMChecklistRunStatus = "in_progress" | "pending_approval" | "approved" | "rejected";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  assignedProperties: string[];
  active: boolean;
  accountStatus?: AccountStatus;
  requestedRole?: UserRole;
  approvalRequiredBy?: "admin" | "owner";
  dailyPropertyId?: string;
  pendingPropertyIds?: string[];
  propertyChangeStatus?: PropertyChangeStatus;
  propertyChangeRequestedAt?: Timestamp;
  propertyChangeRequestedBy?: string;
  propertyChangeReviewedBy?: string;
  propertyChangeReviewedByName?: string;
  propertyChangeReviewedAt?: Timestamp;
  approvedBy?: string;
  approvedByName?: string;
  approvedAt?: Timestamp;
  photoUrl?: string;
  phone?: string;
  jobTitle?: string;
  department?: string;
  bio?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type Property = {
  id: string;
  name: string;
  address: string;
  totalRooms: number;
  roomStartNumber?: number;
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type Room = {
  id: string;
  propertyId: string;
  roomNumber: string;
  status: "available" | "out_of_order" | "inactive";
  currentIssueId?: string;
  lastUpdated?: Timestamp;
};

export type OutOfOrderIssue = {
  id: string;
  propertyId: string;
  roomOrLocation: string;
  locationType: "room" | "common_area" | "back_of_house" | "exterior";
  category: string;
  description: string;
  status: IssueStatus;
  openedBy: string;
  openedByName: string;
  openedAt?: Timestamp;
  closedBy?: string;
  closedByName?: string;
  closedAt?: Timestamp;
  linkedRepairLogIds: string[];
  notes?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type RepairLog = {
  id: string;
  propertyId: string;
  roomOrLocation: string;
  locationType: "room" | "common_area" | "back_of_house" | "exterior";
  category: string;
  issueDescription: string;
  repairExplanation: string;
  partsUsed: string;
  technicianId: string;
  technicianName: string;
  technicianEmail: string;
  startTime: string;
  endTime: string;
  totalMinutes: number;
  beforePhotoUrls: string[];
  afterPhotoUrls: string[];
  statusAfterRepair: "fixed" | "monitoring" | "out_of_order" | "needs_vendor";
  approvalStatus: ApprovalStatus;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: Timestamp;
  rejectionReason?: string;
  adminNotes?: string;
  submittedAt?: Timestamp;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type ScheduledMaintenance = {
  id: string;
  propertyId: string;
  title: string;
  description: string;
  category: string;
  assignedTo: string;
  assignedToName: string;
  recurrence: "none" | "daily" | "weekly" | "monthly" | "quarterly" | "annual";
  dueDate: string;
  completedBy?: string;
  completedByName?: string;
  completedAt?: Timestamp;
  status: MaintenanceStatus;
  requiresPhotos: boolean;
  photoUrls: string[];
  notes?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type PMChecklistItem = {
  id: string;
  label: string;
};

export type PMChecklistRunItem = PMChecklistItem & {
  checked: boolean;
  notes?: string;
};

export type PMChecklistTemplate = {
  id: string;
  propertyId: string;
  title: string;
  sourcePdfName: string;
  sourcePdfUrl: string;
  items: PMChecklistItem[];
  uploadedBy: string;
  uploadedByName: string;
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export type PMChecklistRun = {
  id: string;
  propertyId: string;
  templateId: string;
  templateTitle: string;
  roomNumber: string;
  status: PMChecklistRunStatus;
  items: PMChecklistRunItem[];
  startedBy: string;
  startedByName: string;
  startedAt?: Timestamp;
  submittedBy?: string;
  submittedByName?: string;
  submittedAt?: Timestamp;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: Timestamp;
  adminNotes?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

export const seedProperties: Property[] = [
  {
    id: "hampton_inn",
    name: "Hampton Inn",
    address: "Saint Simons Island, GA",
    totalRooms: 79,
    roomStartNumber: 109,
    active: true,
  },
  {
    id: "holiday_inn_express",
    name: "Holiday Inn Express",
    address: "Brunswick, GA",
    totalRooms: 60,
    roomStartNumber: 101,
    active: true,
  },
  {
    id: "queens_court_inn",
    name: "Queens Court Inn",
    address: "Brunswick, GA",
    totalRooms: 23,
    roomStartNumber: 101,
    active: true,
  },
];

export const categories = [
  "HVAC",
  "Plumbing",
  "Electrical",
  "Door/Lock",
  "Furniture",
  "Appliance",
  "Pool",
  "Elevator",
  "Exterior",
  "Safety",
  "Other",
];
