"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
app.use(express_1.default.json());
app.post("/identity", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, phoneNumber } = req.body;
    if (!email && !phoneNumber) {
        return res.status(400).json({ error: "Email or phoneNumber is required" });
    }
    // Step 1: Find all matching contacts (either email or phone)
    const matchingContacts = yield prisma.contact.findMany({
        where: {
            deletedAt: null,
            OR: [
                { email: email || undefined },
                { phoneNumber: phoneNumber || undefined },
            ],
        },
        orderBy: { createdAt: "asc" },
    });
    let primaryContact;
    let allContacts = [];
    if (matchingContacts.length === 0) {
        // No match — create a new primary contact
        primaryContact = yield prisma.contact.create({
            data: {
                email,
                phoneNumber,
                linkPrecedence: "PRIMARY",
            },
        });
        allContacts = [primaryContact];
    }
    else {
        // Match found — find the oldest primary
        const allLinkedContacts = yield prisma.contact.findMany({
            where: {
                OR: [
                    { id: { in: matchingContacts.map((c) => c.id) } },
                    { linkedId: { in: matchingContacts.map((c) => c.id) } },
                ],
                deletedAt: null,
            },
            orderBy: { createdAt: "asc" },
        });
        allContacts = allLinkedContacts;
        primaryContact =
            allLinkedContacts.find((c) => c.linkPrecedence === "PRIMARY") || allLinkedContacts[0];
        // Create new secondary contact if this email/phone combo doesn’t exactly exist
        const alreadyExists = allLinkedContacts.some((c) => c.email === email && c.phoneNumber === phoneNumber);
        if (!alreadyExists) {
            yield prisma.contact.create({
                data: {
                    email,
                    phoneNumber,
                    linkedId: primaryContact.id,
                    linkPrecedence: "SECONDARY",
                },
            });
            // Fetch again to include newly created one
            allContacts = yield prisma.contact.findMany({
                where: {
                    OR: [
                        { id: primaryContact.id },
                        { linkedId: primaryContact.id },
                    ],
                    deletedAt: null,
                },
                orderBy: { createdAt: "asc" },
            });
        }
    }
    const emails = Array.from(new Set(allContacts.map(c => c.email).filter(Boolean)));
    const phoneNumbers = Array.from(new Set(allContacts.map(c => c.phoneNumber).filter(Boolean)));
    const secondaryContactIds = allContacts
        .filter(c => c.id !== primaryContact.id)
        .map(c => c.id);
    return res.json({
        contact: {
            primaryContactId: primaryContact.id,
            emails,
            phoneNumbers,
            secondaryContactIds,
        },
    });
}));
app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});
