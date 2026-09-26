import { DataTypes } from "sequelize";

export default {
    name: "category",
    define: {
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: "users", key: "id" },
            onDelete: "CASCADE"
        },
        name: {
            type: DataTypes.STRING(80),
            allowNull: false
        }
    },
    options: {
        tableName: "categories",
        timestamps: true,
        indexes: [
            {
                unique: true,
                fields: ["userId", "name"]
            }
        ]
    }
};
