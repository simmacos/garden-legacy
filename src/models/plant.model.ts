import { DataTypes } from "sequelize";

export default {
    name: "plant",
    define: {
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: "users", key: "id" },
            onDelete: "CASCADE"
        },
        categoryId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: "categories", key: "id" },
            onDelete: "SET NULL"
        },
        name: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        notes: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        lastWateredAt: {
            type: DataTypes.DATEONLY,
            allowNull: true,
            defaultValue: null
        },
        wateringIntervalDays: {
            type: DataTypes.SMALLINT.UNSIGNED,
            allowNull: true,
            defaultValue: null
        },
        lastFertilizedAt: {
            type: DataTypes.DATEONLY,
            allowNull: true,
            defaultValue: null
        },
        fertilizingIntervalDays: {
            type: DataTypes.SMALLINT.UNSIGNED,
            allowNull: true,
            defaultValue: null
        }
    },
    options: {
        tableName: "plants",
        timestamps: true,
        indexes: [
            { fields: ["userId"] },
            { fields: ["categoryId"] }
        ]
    }
};
