const Lead = {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    status: "new", // options: new, contacted, qualified, lost
    source: "",    // e.g., "website", "manual", "referral"
    notes: "",
    assignedTo: "", // Admin ID
    createdAt: ""
};

module.exports = Lead;