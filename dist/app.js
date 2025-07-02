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
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
app.use(express_1.default.json());
app.post("/identity", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, phoneNumber } = req.body;
    if (!email && !phoneNumber) {
        return res.status(400).json({ error: "Email or phoneNumber is required" });
    }
    // Step 1: Find all matching contacts (email or phone)
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
    let newlyCreatedSecondaryId = null;
    if (matchingContacts.length === 0) {
        // No match — create new PRIMARY contact
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
        // Step 2: Find all linked contacts (directly or indirectly)
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
        // Step 3: Identify the oldest PRIMARY as the true primary
        primaryContact =
            allLinkedContacts.find((c) => c.linkPrecedence === "PRIMARY") ||
                allLinkedContacts[0];
        // Step 4: Demote any newer PRIMARYs to SECONDARY
        const contactsToUpdate = allLinkedContacts.filter((c) => c.linkPrecedence === "PRIMARY" &&
            c.id !== primaryContact.id);
        for (const contact of contactsToUpdate) {
            yield prisma.contact.update({
                where: { id: contact.id },
                data: {
                    linkPrecedence: "SECONDARY",
                    linkedId: primaryContact.id,
                    updatedAt: new Date(),
                },
            });
        }
        // Step 5: Check if an exact (email + phone) match exists
        const alreadyExists = allLinkedContacts.some((c) => c.email === email && c.phoneNumber === phoneNumber);
        if (!alreadyExists) {
            const newSecondary = yield prisma.contact.create({
                data: {
                    email,
                    phoneNumber,
                    linkedId: primaryContact.id,
                    linkPrecedence: "SECONDARY",
                },
            });
            newlyCreatedSecondaryId = newSecondary.id;
        }
        // Step 6: Fetch updated list of all linked contacts
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
    // Prepare response
    const emails = Array.from(new Set(allContacts.map((c) => c.email).filter(Boolean)));
    const phoneNumbers = Array.from(new Set(allContacts.map((c) => c.phoneNumber).filter(Boolean)));
    const secondaryContactIds = allContacts
        .filter((c) => c.linkPrecedence === "SECONDARY" &&
        c.id !== newlyCreatedSecondaryId)
        .map((c) => c.id);
    return res.json({
        contact: {
            primaryContactId: primaryContact.id,
            emails,
            phoneNumbers,
            secondaryContactIds,
        },
    });
}));
app.listen(process.env.PORT, () => {
    console.log("Server running on http://localhost:3000");
});
