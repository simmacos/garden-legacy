import { DataTypes } from "sequelize";

export default {
    name: "session",

    define: {
        token: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            unique: false
        },
        expiresAt: {
            type: DataTypes.DATE,
            allowNull: false,
            unique: false
        }
    },

    options: {
        timestamps: true
    }
}