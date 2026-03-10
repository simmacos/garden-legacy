// src/models/user.model.ts
import { DataTypes } from "sequelize";

export default {
    name: "user",
    
    define: {
        username: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
        }
    },
    
    options: {
        timestamps: true 
    }
};
